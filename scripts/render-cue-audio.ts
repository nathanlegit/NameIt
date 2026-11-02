// F11b: renders every description the player could speak to an ElevenLabs MP3.
//
//   pnpm render-cue-audio [videoId ...]    (default: every video in the eval test set)
//
// For each video it renders the draft text of every cue (short for inline,
// long for extended) and every reviewer's final text, to
//   data/videos/<id>/cue-audio/<voiceId>/<cueAudioKey(text)>.mp3
// Existing files are kept, so re-running after an edit only renders the new text.
// Then run `pnpm export-demo` to copy them next to the web video.

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJson } from "../src/lib/cache";
import { TEST_SET } from "../src/eval/testSet";
import { loadLocalEnv } from "../src/meta/client";
import { videoPaths } from "../src/pipeline/store";
import { DESCRIBER_VOICE_ID, requireElevenLabsKey, synthesise } from "../src/tts/elevenlabs";
import type { Cue } from "../src/types";
import { cueAudioKey, normaliseCueText } from "../src/web/cueAudio";
import { readReviewState } from "./export-demo";

export function describerVoiceId(): string {
  return process.env.ELEVENLABS_DESCRIBER_VOICE_ID || DESCRIBER_VOICE_ID;
}

export function cueAudioDir(videoId: string): string {
  return path.join(videoPaths(videoId).dir, "cue-audio", describerVoiceId());
}

// Every text the player might speak for this video.
export async function speakableTexts(videoId: string): Promise<string[]> {
  const cues = await readJson<Cue[]>(videoPaths(videoId).cues);
  const review = await readReviewState(videoId);
  const texts = [
    ...cues.map((cue) => (cue.delivery === "inline" ? cue.shortText : cue.longText)),
    ...Object.values(review.decisions).map((decision) => decision.finalText ?? ""),
  ];
  return [...new Set(texts.map(normaliseCueText).filter(Boolean))];
}

async function main(): Promise<void> {
  loadLocalEnv();
  const apiKey = requireElevenLabsKey();
  const voiceId = describerVoiceId();
  const requested = process.argv.slice(2);
  const videoIds = requested.length > 0 ? requested : TEST_SET.map((entry) => entry.videoId);

  let rendered = 0;
  let characters = 0;
  for (const videoId of videoIds) {
    const outputDir = cueAudioDir(videoId);
    await mkdir(outputDir, { recursive: true });
    const texts = await speakableTexts(videoId);
    let newForVideo = 0;
    for (const text of texts) {
      const outputPath = path.join(outputDir, `${cueAudioKey(text)}.mp3`);
      if (existsSync(outputPath)) continue;
      await writeFile(outputPath, await synthesise(text, voiceId, apiKey));
      newForVideo++;
      characters += text.length;
    }
    rendered += newForVideo;
    console.log(`${videoId}: ${texts.length} descriptions, ${newForVideo} newly rendered`);
  }
  console.log(`Done: ${rendered} new files, ${characters} characters sent to ElevenLabs (voice ${voiceId}). Next: pnpm export-demo`);
}

const isDirectRun = process.argv[1]?.endsWith("render-cue-audio.ts");
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
