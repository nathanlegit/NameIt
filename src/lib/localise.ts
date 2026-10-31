// F4 step 1: estimate WHEN a word was spoken, without word-level timestamps.
//
// Transcribe only tells us when each turn starts and ends. If a word sits 40% of
// the way through the turn's text, we guess it was spoken 40% of the way through
// the turn's time. That's rough (people pause and speed up), so we look at a
// ±1.5 s window around the guess and let Muse Spark pick the best frame (step 2).

import path from "node:path";
import type { Seconds, Turn } from "../types";
import { FRAME_SAMPLE_FPS } from "./ffmpeg";

export const LOCALISATION_HALF_WINDOW_SEC = 1.5;

export function estimateWordTime(turn: Turn, charOffset: number): Seconds {
  const textLength = Math.max(1, turn.text.length);
  const fractionThroughTurn = charOffset / textLength;
  const turnDuration = turn.end - turn.start;
  return turn.start + fractionThroughTurn * turnDuration;
}

export interface TimeWindow {
  start: Seconds;
  end: Seconds;
}

// Window = estimate ± 1.5 s, clamped so it never leaves the turn.
export function windowAroundEstimate(turn: Turn, estimatedTime: Seconds): TimeWindow {
  return {
    start: Math.max(turn.start, estimatedTime - LOCALISATION_HALF_WINDOW_SEC),
    end: Math.min(turn.end, estimatedTime + LOCALISATION_HALF_WINDOW_SEC),
  };
}

// --- Mapping between times and the 2 fps frame files from sampleFrames() ---

export function frameNumberAtTime(time: Seconds): number {
  return Math.round(time * FRAME_SAMPLE_FPS) + 1; // frame files are 1-based
}

export function timeOfFrameNumber(frameNumber: number): Seconds {
  return (frameNumber - 1) / FRAME_SAMPLE_FPS;
}

export function framePath(framesDir: string, frameNumber: number): string {
  return path.join(framesDir, `frame_${String(frameNumber).padStart(5, "0")}.jpg`);
}

// All frame numbers whose time falls inside the window (at least one).
export function frameNumbersInWindow(window: TimeWindow, totalFrames: number): number[] {
  const first = Math.max(1, Math.ceil(window.start * FRAME_SAMPLE_FPS) + 1);
  const last = Math.min(totalFrames, Math.floor(window.end * FRAME_SAMPLE_FPS) + 1);
  if (last < first) return [Math.min(totalFrames, Math.max(1, frameNumberAtTime(window.start)))];
  const numbers: number[] = [];
  for (let frameNumber = first; frameNumber <= last; frameNumber++) numbers.push(frameNumber);
  return numbers;
}

// `count` frames spread evenly across a turn, for the classifier's overview.
export function frameNumbersSpanningTurn(turn: Turn, count: number, totalFrames: number): number[] {
  const numbers = new Set<number>();
  for (let index = 0; index < count; index++) {
    const time = turn.start + ((index + 0.5) / count) * (turn.end - turn.start);
    numbers.add(Math.min(totalFrames, Math.max(1, frameNumberAtTime(time))));
  }
  return [...numbers].sort((first, second) => first - second);
}
