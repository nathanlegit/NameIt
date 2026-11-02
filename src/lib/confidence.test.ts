import { describe, expect, it } from "vitest";
import { bucketFor, combineConfidence, groundingStrength, type ConfidenceSignals } from "./confidence";

const strong: ConfidenceSignals = {
  answered: true,
  sparkConfidence: 0.9,
  agreement: 1,
  samScore: 0.85,
  selectionMargin: 0.4,
  evidenceMatches: true,
  glossaryMatch: true,
};

describe("bucketFor", () => {
  it("uses the PRD thresholds", () => {
    expect(bucketFor(0.75)).toBe("ready");
    expect(bucketFor(0.749)).toBe("needs_review");
    expect(bucketFor(0.45)).toBe("needs_review");
    expect(bucketFor(0.449)).toBe("abstain");
  });
});

describe("groundingStrength", () => {
  it("is 0 without evidence and 1 for a confident, clear-cut pick", () => {
    expect(groundingStrength(null, null)).toBe(0);
    expect(groundingStrength(1, 0.3)).toBe(1);
  });

  it("gives half credit for the margin when the pick was a close call", () => {
    expect(groundingStrength(0.8, 0.15)).toBeCloseTo(0.4 + 0.25);
  });
});

describe("combineConfidence", () => {
  it("puts strong, consistent, grounded answers in ready", () => {
    const result = combineConfidence(strong);
    expect(result.bucket).toBe("ready");
    expect(result.notes).toContain("matches a name used in the video");
  });

  it("drops to needs_review when the two answers disagree", () => {
    const result = combineConfidence({ ...strong, agreement: 0, glossaryMatch: false });
    expect(result.bucket).toBe("needs_review");
    expect(result.notes).toContain("the two answers disagree");
  });

  it("never lets an answer without SAM evidence be ready", () => {
    const result = combineConfidence({ ...strong, samScore: null, selectionMargin: null });
    expect(result.confidence).toBeLessThan(0.75);
    expect(result.notes).toContain("no segmentation evidence");
  });

  it("caps confidence when Spark says the box is wrong (M0 wrong-jar case)", () => {
    // M0: confidence 0.90 while the uncertainty note said the box was the wrong jar.
    const result = combineConfidence({ ...strong, sparkConfidence: 0.9, evidenceMatches: false });
    expect(result.bucket).toBe("needs_review");
  });

  it("abstains when Spark gave no answer", () => {
    expect(combineConfidence({ ...strong, answered: false })).toEqual({
      confidence: 0,
      bucket: "abstain",
      notes: ["Spark could not say what it is"],
    });
  });

  it("abstains when everything is weak", () => {
    const result = combineConfidence({ ...strong, sparkConfidence: 0.4, agreement: 0, samScore: 0.3, selectionMargin: 0.02, glossaryMatch: false });
    expect(result.bucket).toBe("abstain");
  });
});
