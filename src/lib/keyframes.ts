// Stage 03: which frames give Spark an overview of the whole video.
// Scene changes come first (each new shot can show new tools or ingredients),
// then evenly spaced frames fill up to the target count.

import type { Seconds } from "../types";

export const KEYFRAME_TARGET_COUNT = 20;
// Two picks closer than this show the same thing; keep only one.
const MIN_SPACING_SEC = 1.0;

export interface KeyframeChoice {
  time: Seconds;
  reason: "scene_change" | "even_spacing";
}

// Parses `ffmpeg -vf select='gt(scene,X)',showinfo` output: one line per
// selected frame, with its time as "pts_time:24.48".
export function parseSceneChangeTimes(showinfoLog: string): Seconds[] {
  const times: Seconds[] = [];
  for (const match of showinfoLog.matchAll(/pts_time:\s*([\d.]+)/g)) {
    times.push(Number(match[1]));
  }
  return times;
}

export function chooseKeyframeTimes(
  durationSec: Seconds,
  sceneChangeTimes: Seconds[],
  targetCount: number = KEYFRAME_TARGET_COUNT,
): KeyframeChoice[] {
  const chosen: KeyframeChoice[] = [];
  const isFarFromChosen = (time: Seconds) =>
    chosen.every((existing) => Math.abs(existing.time - time) >= MIN_SPACING_SEC);

  // Scene changes, at most half the budget so a choppy edit can't crowd out coverage.
  for (const time of [...sceneChangeTimes].sort((first, second) => first - second)) {
    if (chosen.length >= Math.floor(targetCount / 2)) break;
    if (time >= 0 && time < durationSec && isFarFromChosen(time)) chosen.push({ time, reason: "scene_change" });
  }

  // Evenly spaced frames: the middle of each of `slots` equal slices of the video.
  const slots = targetCount;
  for (let slot = 0; slot < slots && chosen.length < targetCount; slot++) {
    const time = ((slot + 0.5) / slots) * durationSec;
    if (isFarFromChosen(time)) chosen.push({ time, reason: "even_spacing" });
  }

  return chosen.sort((first, second) => first.time - second.time);
}
