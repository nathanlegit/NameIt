// Stage 03, context (F6 context pack): what's in this video, by name.
//
// Spark reads the whole transcript plus about 20 keyframes and lists every
// tool, ingredient and part, using the presenter's own names. Stage 07 uses
// this so "add this" can become "add the walnuts", even when the walnuts were
// only named 15 seconds earlier.
//
// Outputs: keyframes.json (Keyframe[]), glossary.json (GlossaryEntry[])

import { readJson, writeJson } from "../lib/cache";
import { detectSceneChangeLog } from "../lib/ffmpeg";
import { chooseKeyframeTimes, parseSceneChangeTimes } from "../lib/keyframes";
import { framePath, frameNumberAtTime } from "../lib/localise";
import { buildGlossaryPrompt, GlossarySchema } from "../prompts/glossary";
import type { GlossaryEntry, Keyframe, Turn } from "../types";
import { cachedSpark, sparkCostUsd } from "./sparkCache";
import type { Stage } from "./stage";
import { countFrames, readVideoMeta, videoPaths } from "./store";

export function transcriptAsLines(turns: Turn[]): string {
  return turns.map((turn) => `${turn.start.toFixed(1)}: ${turn.text}`).join("\n");
}

export const contextStage: Stage = {
  id: "03",
  name: "context",
  outputs: (videoId) => [videoPaths(videoId).keyframes, videoPaths(videoId).glossary],

  async run(videoId) {
    const paths = videoPaths(videoId);
    const meta = await readVideoMeta(videoId);
    const turns = await readJson<Turn[]>(paths.transcript);
    const totalFrames = await countFrames(videoId);

    // 1. Pick keyframes: scene changes first, then even coverage.
    const sceneChangeTimes = parseSceneChangeTimes(await detectSceneChangeLog(meta.sourcePath));
    const keyframes: Keyframe[] = [];
    for (const choice of chooseKeyframeTimes(meta.durationSec, sceneChangeTimes)) {
      const frameNumber = Math.min(totalFrames, Math.max(1, frameNumberAtTime(choice.time)));
      const keyframePath = framePath(paths.framesDir, frameNumber);
      // Two picks can round to the same 2 fps frame; send each image once.
      if (keyframes.some((existing) => existing.framePath === keyframePath)) continue;
      keyframes.push({ time: choice.time, framePath: keyframePath, reason: choice.reason });
    }

    // 2. One Spark call over the whole video.
    const result = await cachedSpark(paths.cacheDir, {
      schemaName: "glossary",
      schema: GlossarySchema,
      userText: buildGlossaryPrompt({
        transcriptLines: transcriptAsLines(turns),
        keyframeTimes: keyframes.map((keyframe) => keyframe.time),
      }),
      imagePaths: keyframes.map((keyframe) => keyframe.framePath),
      temperature: 0,
    });
    const glossary: GlossaryEntry[] = result.data.entities;

    await writeJson(paths.keyframes, keyframes);
    await writeJson(paths.glossary, glossary);

    const sceneChanges = keyframes.filter((keyframe) => keyframe.reason === "scene_change").length;
    return {
      summary: `${keyframes.length} keyframes (${sceneChanges} scene changes), ${glossary.length} glossary entries`,
      costUsd: sparkCostUsd(result.usage),
    };
  },
};
