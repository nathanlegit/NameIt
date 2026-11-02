// Matching the pipeline's references to the hand labels.
//
// A label says: around time T, the presenter said phrase P (e.g. 38.4 s, "that").
// A prediction is a ReferenceCandidate from references.json, at its turn's start.
// They match when the phrase is the same (ignoring case) and the turn starts
// within MATCH_TOLERANCE_SEC of the label time. Each prediction matches at most
// one label; the nearest wins.
//
// Ties (one long turn with several "this"): labels are written in spoken order,
// so the k-th label for a phrase in a turn gets the k-th occurrence by
// character offset. (held-meat has one 141 s turn with 13 "this".)

import type { EvalReferenceLabel, ReferenceCandidate, Seconds } from "../types";

export const MATCH_TOLERANCE_SEC = 1.0;

export interface TimedPrediction {
  reference: ReferenceCandidate;
  time: Seconds; // start of the turn it was found in
}

export interface LabelMatch {
  label: EvalReferenceLabel;
  prediction: TimedPrediction | null;
}

export interface MatchResult {
  matches: LabelMatch[];
  unlabelled: TimedPrediction[]; // predictions no label claimed
}

function normalisePhrase(phrase: string): string {
  return phrase.trim().toLowerCase();
}

export function matchLabels(labels: EvalReferenceLabel[], predictions: TimedPrediction[]): MatchResult {
  const claimed = new Set<string>();
  // Closest pairs first, so one sloppy label can't steal another's prediction.
  const pairs = labels.flatMap((label, labelIndex) =>
    predictions
      .filter(
        (prediction) =>
          normalisePhrase(prediction.reference.phrase) === normalisePhrase(label.phrase) &&
          Math.abs(prediction.time - label.time) <= MATCH_TOLERANCE_SEC,
      )
      .map((prediction) => ({ labelIndex, prediction, distance: Math.abs(prediction.time - label.time) })),
  );
  pairs.sort(
    (first, second) =>
      first.distance - second.distance ||
      first.labelIndex - second.labelIndex ||
      first.prediction.reference.charOffset - second.prediction.reference.charOffset,
  );

  const matchedPrediction = new Map<number, TimedPrediction>();
  for (const pair of pairs) {
    if (matchedPrediction.has(pair.labelIndex) || claimed.has(pair.prediction.reference.id)) continue;
    matchedPrediction.set(pair.labelIndex, pair.prediction);
    claimed.add(pair.prediction.reference.id);
  }

  return {
    matches: labels.map((label, index) => ({ label, prediction: matchedPrediction.get(index) ?? null })),
    unlabelled: predictions.filter((prediction) => !claimed.has(prediction.reference.id)),
  };
}
