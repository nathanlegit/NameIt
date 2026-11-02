// How many inline cues' recorded audio runs past the next speech turn (player default rate 1.1)?
// When it does, the player pauses the video until the description ends.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { TEST_SET } from "../src/eval/testSet";
import { nextSpeechStart } from "../src/web/playback";
import { cueAudioKey } from "../src/web/cueAudio";
import { cueAudioDir } from "../scripts/render-cue-audio";
import type { Cue, Turn } from "../src/types";

const RATE = 1.1;
let inline = 0, overrun = 0, worst = 0;
for (const { videoId } of TEST_SET) {
  const cues = JSON.parse(readFileSync(`data/videos/${videoId}/cues.json`, "utf8")) as Cue[];
  const turns = JSON.parse(readFileSync(`data/videos/${videoId}/transcript.json`, "utf8")) as Turn[];
  for (const cue of cues.filter((c) => c.delivery === "inline")) {
    const file = path.join(cueAudioDir(videoId), `${cueAudioKey(cue.shortText)}.mp3`);
    if (!existsSync(file)) continue;
    const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString()) / RATE;
    const room = (nextSpeechStart(turns, cue.start) ?? Infinity) - cue.start;
    inline++;
    if (seconds > room) { overrun++; worst = Math.max(worst, seconds - room); }
  }
}
console.log(`${inline} inline cues; ${overrun} would overrun the next turn at ${RATE}x (worst by ${worst.toFixed(2)} s) and pause briefly instead`);
