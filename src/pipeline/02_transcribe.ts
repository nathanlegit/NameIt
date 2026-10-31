// Stage 02, transcribe (F2): speech turns with reliable timing, plus gaps.
//
// Why not just send the whole file to Transcribe? In the M0 spike, its own
// turn-splitting merged 36 seconds of speech into one turn (DECISIONS.md).
// So we find speech locally and only ask the model what was said:
//   1. ffmpeg silencedetect -> silences -> speech segments (exact times)
//   2. cut each segment out and transcribe it on its own (in parallel)
//   3. each segment with words becomes a turn; clean up stutters
//   4. gaps = the time between turns (computeGaps)
//
// Outputs in data/videos/<id>/:
//   speech_segments.json  every segment with its raw transcript (for debugging)
//   transcript.json       Turn[]
//   gaps.json             Gap[]

import path from "node:path";
import { cachedJson, writeJson } from "../lib/cache";
import { mapWithConcurrency } from "../lib/concurrency";
import { keywordsForDomain } from "../lib/domainKeywords";
import { cutAudio, detectSilenceLog, SILENCE_MIN_DURATION_SEC, SILENCE_THRESHOLD_DB } from "../lib/ffmpeg";
import { computeGaps } from "../lib/gaps";
import { parseSilenceDetectLog, speechSegmentsFromSilences, type TimeSpan } from "../lib/silence";
import { collapseRepeatedWords } from "../lib/text";
import { transcribeWav, type TranscribeResponse } from "../meta/transcribe";
import type { Turn } from "../types";
import type { Stage } from "./stage";
import { readVideoMeta, videoPaths } from "./store";

// Extra audio kept either side of a segment when cutting it, so the first and
// last syllables aren't clipped. Turn times still use the unpadded segment.
const CUT_PADDING_SEC = 0.15;
// How many segments to transcribe at once (the API allows 256 streams).
const TRANSCRIBE_CONCURRENCY = 8;
// A segment longer than this (continuous speech, or speech over music) is too
// coarse for F4's time estimate, so inside it we use the model's own turns.
const LONG_SEGMENT_SEC = 15;
const TRANSCRIBE_DOLLARS_PER_AUDIO_HOUR = 0.18;

interface TranscribedSegment extends TimeSpan {
  index: number;
  cutStart: number;      // where the cut audio actually starts (with padding)
  rawText: string;
  response: TranscribeResponse;
}

function segmentFileStem(segment: TimeSpan): string {
  // Named by time, so changing the silence settings can't reuse a stale cache entry.
  return `seg_${Math.round(segment.start * 1000)}-${Math.round(segment.end * 1000)}`;
}

async function transcribeSegment(
  videoId: string,
  segment: TimeSpan,
  index: number,
  audioDurationSec: number,
  keywords: string[],
): Promise<TranscribedSegment> {
  const paths = videoPaths(videoId);
  const stem = segmentFileStem(segment);
  const cutStart = Math.max(0, segment.start - CUT_PADDING_SEC);
  const cutEnd = Math.min(audioDurationSec, segment.end + CUT_PADDING_SEC);
  const segmentWavPath = path.join(paths.segmentAudioDir, `${stem}.wav`);

  const response = await cachedJson(path.join(paths.cacheDir, "transcribe", `${stem}.json`), async () => {
    await cutAudio(paths.audio, cutStart, cutEnd, segmentWavPath);
    return transcribeWav(segmentWavPath, { keywords, mode: "ENDPOINTING" });
  });

  return { ...segment, index, cutStart, rawText: response.transcript.trim(), response };
}

// Turns from one segment. Usually the whole segment is one turn. A long
// segment is split using the model's turns, shifted from "time within the cut
// audio" to "time within the video" and kept inside the segment.
function turnsFromSegment(segment: TranscribedSegment): Array<Omit<Turn, "id">> {
  const segmentDuration = segment.end - segment.start;
  const modelTurns = segment.response.turns.filter((turn) => turn.transcript.trim().length > 0);

  if (segmentDuration > LONG_SEGMENT_SEC && modelTurns.length > 1) {
    return modelTurns.map((modelTurn) => ({
      speaker: "presenter",
      start: Math.max(segment.start, segment.cutStart + modelTurn.startMs / 1000),
      end: Math.min(segment.end, segment.cutStart + modelTurn.endMs / 1000),
      text: collapseRepeatedWords(modelTurn.transcript.trim()),
    }));
  }

  return [{ speaker: "presenter", start: segment.start, end: segment.end, text: collapseRepeatedWords(segment.rawText) }];
}

export const transcribeStage: Stage = {
  id: "02",
  name: "transcribe",
  outputs: (videoId) => [videoPaths(videoId).transcript, videoPaths(videoId).gaps],

  async run(videoId) {
    const paths = videoPaths(videoId);
    const meta = await readVideoMeta(videoId);
    const keywords = keywordsForDomain(meta.domainHint);

    // 1. Where is there sound at all?
    const silenceLog = await detectSilenceLog(paths.audio);
    const silences = parseSilenceDetectLog(silenceLog, meta.durationSec);
    const segments = speechSegmentsFromSilences(silences, meta.durationSec);

    // 2. What was said in each segment?
    const transcribed = await mapWithConcurrency(segments, TRANSCRIBE_CONCURRENCY, (segment, index) =>
      transcribeSegment(videoId, segment, index, meta.durationSec, keywords),
    );

    // 3. Segments with words become turns (no words = music, breath, a clatter).
    const turns: Turn[] = transcribed
      .flatMap(turnsFromSegment)
      .filter((turn) => turn.text.length > 0)
      .sort((first, second) => first.start - second.start)
      .map((turn, index) => ({ id: `t${index}`, ...turn }));

    // 4. Where can description go?
    const gaps = computeGaps(turns, meta.durationSec);

    await writeJson(paths.speechSegments, {
      settings: { silenceThresholdDb: SILENCE_THRESHOLD_DB, silenceMinDurationSec: SILENCE_MIN_DURATION_SEC, keywords },
      segments: transcribed.map(({ index, start, end, cutStart, rawText }) => ({ index, start, end, cutStart, rawText })),
    });
    await writeJson(paths.transcript, turns);
    await writeJson(paths.gaps, gaps);

    const transcribedAudioSec = transcribed.reduce(
      (total, segment) => total + (segment.end - segment.start) + 2 * CUT_PADDING_SEC,
      0,
    );
    const emptySegments = transcribed.filter((segment) => segment.rawText.length === 0).length;
    const totalGapSec = gaps.reduce((total, gap) => total + gap.durationSec, 0);
    return {
      summary: `${segments.length} speech segments (${emptySegments} without words), ${turns.length} turns, ${gaps.length} gaps totalling ${totalGapSec.toFixed(1)} s`,
      costUsd: (transcribedAudioSec / 3600) * TRANSCRIBE_DOLLARS_PER_AUDIO_HOUR,
    };
  },
};
