import { describe, expect, it } from "vitest";
import { computeSplitMetrics, ratio, type EvalItem, type SystemAnswer, type VideoTiming } from "./metrics";

function answer(bucket: SystemAnswer["bucket"], correct: boolean | null): SystemAnswer {
  return { text: bucket === "abstain" ? null : "x", confidence: 0.5, bucket, correct, judgeReason: null };
}

function item(overrides: Partial<EvalItem>): EvalItem {
  return {
    videoId: "v", split: "scripted", labelTime: 0, phrase: "this", isVisual: true, trueReferent: "x",
    referenceId: "r", detected: true, nameIt: null, baseline: null, ...overrides,
  };
}

const timing: VideoTiming = {
  videoId: "v", split: "scripted", durationSec: 120, cues: 4, inlineCues: 3, inlineFitting: 3, overlaps: 0, unlabelledPredictions: 1,
};

describe("ratio", () => {
  it("is null for an empty denominator", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
  });
});

describe("computeSplitMetrics", () => {
  const items: EvalItem[] = [
    item({ nameIt: answer("ready", true), baseline: answer("ready", true) }),
    item({ nameIt: answer("ready", false), baseline: answer("ready", false) }),
    item({ nameIt: answer("needs_review", true), baseline: answer("ready", false) }),
    item({ nameIt: answer("abstain", null), baseline: answer("ready", false) }),
    item({ detected: false, referenceId: null }),                 // missed
    item({ isVisual: false, detected: true }),                    // decoy wrongly flagged
    item({ isVisual: false, detected: false }),                   // decoy correctly rejected
  ];
  const metrics = computeSplitMetrics("scripted", items, [timing]);

  it("computes detection recall and precision", () => {
    expect(metrics.visualLabels).toBe(5);
    expect(metrics.detected).toBe(4);
    expect(metrics.detectionRecall).toBe(4 / 5);
    expect(metrics.falsePositives).toBe(1);
    expect(metrics.detectionPrecision).toBe(4 / 5);
  });

  it("computes resolution accuracy over answered items and abstention over detected", () => {
    expect(metrics.nameIt.answered).toBe(3);
    expect(metrics.nameIt.resolutionAccuracy).toBe(2 / 3);
    expect(metrics.nameIt.abstentionRate).toBe(1 / 4);
  });

  it("computes ready precision and hallucination rate", () => {
    expect(metrics.nameIt.ready).toBe(2);
    expect(metrics.nameIt.readyPrecision).toBe(0.5);
    expect(metrics.nameIt.hallucinationRate).toBe(0.5);
    expect(metrics.baseline.hallucinationRate).toBe(3 / 4);
  });

  it("counts unresolved references per minute before and after", () => {
    expect(metrics.minutes).toBe(2);
    expect(metrics.unresolvedPerMinuteBefore).toBe(5 / 2);
    expect(metrics.nameIt.unresolvedPerMinute).toBe((5 - 2) / 2);
  });

  it("reports cue timing fit", () => {
    expect(metrics.cueTimingFit).toBe(1);
    expect(metrics.unlabelledPredictions).toBe(1);
  });
});
