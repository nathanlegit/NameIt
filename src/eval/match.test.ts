import { describe, expect, it } from "vitest";
import { matchLabels, type TimedPrediction } from "./match";
import type { EvalReferenceLabel } from "../types";

function label(time: number, phrase: string, isVisual = true): EvalReferenceLabel {
  return { videoId: "v", time, phrase, isVisual, trueReferent: "x", acceptableAlternatives: [] };
}

function prediction(id: string, time: number, phrase: string, charOffset = 0): TimedPrediction {
  return {
    time,
    reference: { id, turnId: "t", phrase, charOffset, isVisualReference: true, kind: "object", classifierReason: "" },
  };
}

describe("matchLabels", () => {
  it("matches by phrase (ignoring case) and nearby time", () => {
    const result = matchLabels([label(9.4, "This")], [prediction("a", 9.4, "this")]);
    expect(result.matches[0]!.prediction?.reference.id).toBe("a");
    expect(result.unlabelled).toEqual([]);
  });

  it("does not match a different phrase or a distant time", () => {
    const result = matchLabels([label(10, "this")], [prediction("a", 10, "that"), prediction("b", 12, "this")]);
    expect(result.matches[0]!.prediction).toBeNull();
    expect(result.unlabelled.map((item) => item.reference.id)).toEqual(["a", "b"]);
  });

  it("gives each prediction to at most one label, nearest first", () => {
    const result = matchLabels([label(38.4, "that"), label(38.9, "that")], [prediction("a", 38.5, "that")]);
    expect(result.matches[0]!.prediction?.reference.id).toBe("a");
    expect(result.matches[1]!.prediction).toBeNull();
  });

  it("pairs repeated phrases in one long turn by spoken order", () => {
    // Predictions arrive out of order; labels are in spoken order.
    const result = matchLabels(
      [label(0, "this"), label(0, "this"), label(0, "this")],
      [prediction("third", 0, "this", 300), prediction("first", 0, "this", 10), prediction("second", 0, "this", 120)],
    );
    expect(result.matches.map((match) => match.prediction?.reference.id)).toEqual(["first", "second", "third"]);
  });

  it("keeps two references in one sentence apart", () => {
    const result = matchLabels(
      [label(38.4, "that"), label(38.4, "right there")],
      [prediction("a", 38.5, "that"), prediction("b", 38.5, "right there")],
    );
    expect(result.matches.map((match) => match.prediction?.reference.id)).toEqual(["a", "b"]);
  });
});
