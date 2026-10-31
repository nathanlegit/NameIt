// Finding speech segments from silence, without any model.
//
// ffmpeg's `silencedetect` filter prints a line every time the audio drops
// below a loudness threshold for long enough, and another when it comes back:
//   [silencedetect @ 0x...] silence_start: 3.2177
//   [silencedetect @ 0x...] silence_end: 4.947 | silence_duration: 1.7293
// Everything between silences is (probably) speech. We transcribe each of
// those stretches separately, so every sentence gets an exact start and end.
// Pure functions only; the ffmpeg call itself lives in ffmpeg.ts.

import type { Seconds } from "../types";

export interface TimeSpan {
  start: Seconds;
  end: Seconds;
}

// Parses silencedetect's log output into silence spans.
// If the audio ends while silent, ffmpeg prints a final silence_start with no
// matching silence_end, so that silence runs to the end of the audio.
export function parseSilenceDetectLog(log: string, audioDurationSec: Seconds): TimeSpan[] {
  const silences: TimeSpan[] = [];
  let openSilenceStart: number | null = null;

  for (const line of log.split("\n")) {
    const startMatch = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (startMatch) {
      openSilenceStart = Math.max(0, Number(startMatch[1]));
      continue;
    }
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);
    if (endMatch && openSilenceStart !== null) {
      silences.push({ start: openSilenceStart, end: Number(endMatch[1]) });
      openSilenceStart = null;
    }
  }

  if (openSilenceStart !== null && openSilenceStart < audioDurationSec) {
    silences.push({ start: openSilenceStart, end: audioDurationSec });
  }
  return silences;
}

// Segments shorter than this are almost always clicks or breaths, not words.
export const MIN_SPEECH_SEGMENT_SEC = 0.2;

// The complement of the silences: every stretch of sound between them.
export function speechSegmentsFromSilences(silences: TimeSpan[], audioDurationSec: Seconds): TimeSpan[] {
  const sortedSilences = [...silences].sort((first, second) => first.start - second.start);
  const segments: TimeSpan[] = [];
  let cursor = 0;

  for (const silence of sortedSilences) {
    if (silence.start > cursor) segments.push({ start: cursor, end: silence.start });
    cursor = Math.max(cursor, silence.end);
  }
  if (cursor < audioDurationSec) segments.push({ start: cursor, end: audioDurationSec });

  return segments.filter((segment) => segment.end - segment.start >= MIN_SPEECH_SEGMENT_SEC);
}
