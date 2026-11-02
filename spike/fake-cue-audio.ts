// Test helper: renders stand-in description audio with macOS `say` (no API key),
// into the "test-say" voice folder, to exercise the F11b path end to end.
//   ELEVENLABS_DESCRIBER_VOICE_ID=test-say pnpm tsx spike/fake-cue-audio.ts clip2
// Remove afterwards: rm -rf data/videos/<id>/cue-audio/test-say, then re-export without the env var.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { cueAudioKey } from "../src/web/cueAudio";
import { cueAudioDir, speakableTexts } from "../scripts/render-cue-audio";

if (process.env.ELEVENLABS_DESCRIBER_VOICE_ID !== "test-say") throw new Error("Set ELEVENLABS_DESCRIBER_VOICE_ID=test-say");
for (const videoId of process.argv.slice(2)) {
  const dir = cueAudioDir(videoId);
  mkdirSync(dir, { recursive: true });
  for (const text of await speakableTexts(videoId)) {
    const mp3 = path.join(dir, `${cueAudioKey(text)}.mp3`);
    if (existsSync(mp3)) continue;
    const aiff = `${mp3}.aiff`;
    execFileSync("say", ["-o", aiff, text]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-codec:a", "libmp3lame", "-q:a", "5", mp3]);
    execFileSync("rm", [aiff]);
  }
  console.log(`${videoId}: stand-in audio in ${dir}`);
}
