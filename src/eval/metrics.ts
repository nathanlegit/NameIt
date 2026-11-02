// PRD 13.2 metrics, computed from per-label eval items. Pure functions.
//
// A ratio is null when its denominator is 0 ("no ready items", not "0%").

import type { Resolution, Seconds } from "../types";
import type { Split } from "./testSet";

export interface SystemAnswer {
  text: string | null;          // null when abstained
  confidence: number;
  bucket: Resolution["bucket"];
  correct: boolean | null;      // judge verdict; null when abstained
  judgeReason: string | null;
}

export interface EvalItem {
  videoId: string;
  split: Split;
  labelTime: Seconds;
  phrase: string;
  isVisual: boolean;
  trueReferent: string;
  referenceId: string | null;   // matched prediction, if any
  detected: boolean;            // matched AND classified visual
  nameIt: SystemAnswer | null;  // only for detected visual labels
  baseline: SystemAnswer | null;
}

export interface VideoTiming {
  videoId: string;
  split: Split;
  durationSec: Seconds;
  cues: number;
  inlineCues: number;
  inlineFitting: number;        // inline cues that end before the next turn starts
  overlaps: number;
  unlabelledPredictions: number;
}

export interface SystemMetrics {
  answered: number;
  correct: number;
  resolutionAccuracy: number | null;  // correct / answered
  abstentionRate: number | null;      // abstained / detected
  ready: number;
  readyPrecision: number | null;      // correct ready / ready
  hallucinationRate: number | null;   // wrong ready / ready
  unresolvedPerMinute: number | null; // visual labels without a correct answer, per minute
}

export interface SplitMetrics {
  split: Split | "all";
  videos: number;
  minutes: number;
  visualLabels: number;
  decoyLabels: number;
  detected: number;
  falsePositives: number;             // decoys classified visual
  unlabelledPredictions: number;      // visual predictions with no label (not counted either way)
  detectionRecall: number | null;
  detectionPrecision: number | null;
  unresolvedPerMinuteBefore: number | null;
  nameIt: SystemMetrics;
  baseline: SystemMetrics;
  cues: number;
  inlineCues: number;
  cueTimingFit: number | null;
  overlaps: number;
}

// 0.754 -> "75%"; null -> "–".
export function percent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)}%`;
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function systemMetrics(
  detectedItems: EvalItem[],
  pick: (item: EvalItem) => SystemAnswer | null,
  visualLabels: number,
  minutes: number,
): SystemMetrics {
  const answers = detectedItems.map(pick).filter((answer): answer is SystemAnswer => answer !== null);
  const answered = answers.filter((answer) => answer.bucket !== "abstain");
  const correct = answered.filter((answer) => answer.correct === true).length;
  const ready = answered.filter((answer) => answer.bucket === "ready");
  const readyCorrect = ready.filter((answer) => answer.correct === true).length;
  return {
    answered: answered.length,
    correct,
    resolutionAccuracy: ratio(correct, answered.length),
    abstentionRate: ratio(answers.length - answered.length, answers.length),
    ready: ready.length,
    readyPrecision: ratio(readyCorrect, ready.length),
    hallucinationRate: ratio(ready.length - readyCorrect, ready.length),
    unresolvedPerMinute: ratio(visualLabels - correct, minutes),
  };
}

export function computeSplitMetrics(split: Split | "all", items: EvalItem[], timings: VideoTiming[]): SplitMetrics {
  const visual = items.filter((item) => item.isVisual);
  const decoys = items.filter((item) => !item.isVisual);
  const detected = visual.filter((item) => item.detected);
  const falsePositives = decoys.filter((item) => item.detected).length;
  const minutes = timings.reduce((total, timing) => total + timing.durationSec, 0) / 60;
  const inlineCues = timings.reduce((total, timing) => total + timing.inlineCues, 0);
  const inlineFitting = timings.reduce((total, timing) => total + timing.inlineFitting, 0);

  return {
    split,
    videos: timings.length,
    minutes,
    visualLabels: visual.length,
    decoyLabels: decoys.length,
    detected: detected.length,
    falsePositives,
    unlabelledPredictions: timings.reduce((total, timing) => total + timing.unlabelledPredictions, 0),
    detectionRecall: ratio(detected.length, visual.length),
    detectionPrecision: ratio(detected.length, detected.length + falsePositives),
    unresolvedPerMinuteBefore: ratio(visual.length, minutes),
    nameIt: systemMetrics(detected, (item) => item.nameIt, visual.length, minutes),
    baseline: systemMetrics(detected, (item) => item.baseline, visual.length, minutes),
    cues: timings.reduce((total, timing) => total + timing.cues, 0),
    inlineCues,
    cueTimingFit: ratio(inlineFitting, inlineCues),
    overlaps: timings.reduce((total, timing) => total + timing.overlaps, 0),
  };
}
