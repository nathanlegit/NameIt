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
import { TEST_SET } from "../src/eval/testSet";
import { loadLocalEnv } from "../src/meta/client";
import { cueAudioDir, describerVoiceId, speakableTexts } from "../src/pipeline/demoData";
import { requireElevenLabsKey, synthesise } from "../src/tts/elevenlabs";
import { cueAudioKey } from "../src/web/cueAudio";

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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
