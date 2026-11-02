// F11 player logic, kept out of React so it can be tested.
//
// Which cues play:
//   "reviewed" mode: only cues a human approved or edited.
//   "auto" mode:     those, plus unreviewed cues Name It put in `ready`.
//   Rejected cues and abstentions never play unless a human wrote text for them.
//
// When they play: the player checks the video clock every animation frame and
// fires cues whose start time it has just passed. A jump (seek) fires nothing.

import type { Seconds } from "../types";
import type { BundleItem, ReviewState } from "./bundle";

export type PlaybackMode = "reviewed" | "auto";

export interface PlayableCue {
  id: string;
  referenceId: string;
  start: Seconds;
  delivery: "inline" | "extended";
  text: string;
  reviewed: boolean;
}

// Playback that moves further than this in one frame is a seek, not playing.
export const MAX_PLAYBACK_STEP_SEC = 1.0;

export function draftText(item: BundleItem): string | null {
  if (!item.cue) return null;
  return item.cue.delivery === "inline" ? item.cue.shortText : item.cue.longText;
}

export function playableCues(items: BundleItem[], review: ReviewState, mode: PlaybackMode): PlayableCue[] {
  const cues: PlayableCue[] = [];
  for (const item of items) {
    const decision = review.decisions[item.referenceId];
    if (decision?.status === "rejected") continue;

    const reviewed = decision !== undefined;
    const autoReady = mode === "auto" && item.cue?.bucket === "ready";
    if (!reviewed && !autoReady) continue;

    const text = (decision?.finalText ?? draftText(item))?.trim();
    if (!text) continue;

    // An abstained item a reviewer filled in has no placed cue: pause after its sentence.
    cues.push({
      id: item.cueId,
      referenceId: item.referenceId,
      start: item.cue?.start ?? item.sentence.end,
      delivery: item.cue?.delivery ?? "extended",
      text,
      reviewed,
    });
  }
  return cues.sort((first, second) => first.start - second.start);
}

// Cues whose start lies in (fromTime, toTime], if that step was normal playback.
export function cuesCrossed(cues: PlayableCue[], fromTime: Seconds, toTime: Seconds): PlayableCue[] {
  const step = toTime - fromTime;
  if (step <= 0 || step > MAX_PLAYBACK_STEP_SEC) return [];
  return cues.filter((cue) => cue.start > fromTime && cue.start <= toTime);
}

// When the presenter next starts talking after `time`. An inline cue that is
// still being spoken then pauses the video, so it never talks over them
// (the TTS voice can be slower than the 2.5 words per second the placement assumed).
export function nextSpeechStart(turns: Array<{ start: Seconds; text: string }>, time: Seconds): Seconds | null {
  let next: Seconds | null = null;
  for (const turn of turns) {
    if (turn.text.trim().length === 0 || turn.start <= time) continue;
    if (next === null || turn.start < next) next = turn.start;
  }
  return next;
}

export const MIN_SPEECH_RATE = 0.8;
export const MAX_SPEECH_RATE = 2.0;

export function stepRate(rate: number, direction: 1 | -1): number {
  const stepped = Math.round((rate + direction * 0.1) * 10) / 10;
  return Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, stepped));
}
