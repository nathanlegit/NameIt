// F7: combine the evidence into one confidence and a bucket.
//
// A wrong confident description is worse than none, so confidence is built
// from evidence, not just from what Spark says about itself:
//
//   combined = 0.50 x Spark's own confidence (mean of the two answers)
//            + 0.25 x agreement between the two answers (self-consistency)
//            + 0.25 x grounding strength (SAM score and selection margin)
//            + 0.05 bonus if the name matches a glossary entry
//
// Then caps, which win over the sum:
//   - no SAM evidence                 -> at most needs_review
//   - Spark says the box is wrong     -> at most needs_review (the M0 wrong-jar case)
//   - the first answer is null        -> abstain
//
// Weights and thresholds are first guesses, tuned on the scripted clips only.
// Record changes in docs/DECISIONS.md.

import type { Resolution } from "../types";

export const READY_THRESHOLD = 0.75;
export const REVIEW_THRESHOLD = 0.45;

const SPARK_WEIGHT = 0.5;
const AGREEMENT_WEIGHT = 0.25;
const GROUNDING_WEIGHT = 0.25;
const GLOSSARY_BONUS = 0.05;
// A selection margin this big (or bigger) counts as a clear win.
const CLEAR_MARGIN = 0.3;
// Highest confidence allowed when a cap applies: just under READY_THRESHOLD.
const CAPPED_CONFIDENCE = 0.7;

export interface ConfidenceSignals {
  answered: boolean;              // the first answer named something
  sparkConfidence: number;        // 0-1, mean of the two answers' self-reported confidence
  agreement: number;              // 0-1, nameAgreement() of the two answers
  samScore: number | null;        // null when SAM found nothing
  selectionMargin: number | null; // null when SAM found nothing
  evidenceMatches: boolean;       // both answers say the green box is the referent
  glossaryMatch: boolean;
}

export interface ConfidenceResult {
  confidence: number;
  bucket: Resolution["bucket"];
  notes: string[];                // plain-language reasons, shown to the reviewer
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function groundingStrength(samScore: number | null, selectionMargin: number | null): number {
  if (samScore === null || selectionMargin === null) return 0;
  return 0.5 * clamp01(samScore) + 0.5 * clamp01(selectionMargin / CLEAR_MARGIN);
}

export function bucketFor(confidence: number): Resolution["bucket"] {
  if (confidence >= READY_THRESHOLD) return "ready";
  if (confidence >= REVIEW_THRESHOLD) return "needs_review";
  return "abstain";
}

export function combineConfidence(signals: ConfidenceSignals): ConfidenceResult {
  if (!signals.answered) {
    return { confidence: 0, bucket: "abstain", notes: ["Spark could not say what it is"] };
  }

  const notes: string[] = [];
  let confidence =
    SPARK_WEIGHT * clamp01(signals.sparkConfidence) +
    AGREEMENT_WEIGHT * clamp01(signals.agreement) +
    GROUNDING_WEIGHT * groundingStrength(signals.samScore, signals.selectionMargin);
  if (signals.glossaryMatch) {
    confidence += GLOSSARY_BONUS;
    notes.push("matches a name used in the video");
  }
  if (signals.agreement < 0.5) notes.push("the two answers disagree");

  if (signals.samScore === null) {
    confidence = Math.min(confidence, CAPPED_CONFIDENCE);
    notes.push("no segmentation evidence");
  }
  if (signals.samScore !== null && !signals.evidenceMatches) {
    confidence = Math.min(confidence, CAPPED_CONFIDENCE);
    notes.push("Spark says the highlighted region may not be the referent");
  }

  confidence = Math.round(clamp01(confidence) * 1000) / 1000;
  return { confidence, bucket: bucketFor(confidence), notes };
}
