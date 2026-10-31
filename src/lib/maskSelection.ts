// F5: choose WHICH of SAM's detections is the thing the presenter means.
//
// SAM finds every "bowl" in the frame; it doesn't know which bowl "this" is.
// We pick with explicit rules, in priority order, and keep the reasons so the
// review UI can show why:
//   1. Prefer objects that overlap or touch a hand (hand-object interaction).
//   2. (M2, needs video tracking) Prefer objects that move during the window.
//   3. Then prefer objects nearer the frame centre, then larger ones.
// Pure functions only, so this can be unit-tested without the API.

import type { PixelBox, SamDetection } from "../meta/sam";

export interface FrameSize {
  width: number;
  height: number;
}

export interface ScoredDetection {
  detection: SamDetection;
  touchesHand: boolean;
  centreCloseness: number; // 1 = dead centre, 0 = a corner
  areaFraction: number;    // share of the frame the box covers
  score: number;
  reasons: string[];
}

export interface MaskSelectionResult {
  chosen: ScoredDetection | null;
  ranked: ScoredDetection[];
  selectionMargin: number; // chosen score minus runner-up score (0 if no runner-up)
}

// Rule weights. Touching a hand dominates; centre and size break ties.
const WEIGHT_TOUCHES_HAND = 1.0;
const WEIGHT_CENTRE = 0.3;
const WEIGHT_AREA = 0.2;
// Boxes this close to a hand box (as a share of frame width) count as touching.
const TOUCH_TOLERANCE_FRACTION = 0.02;

function boxesTouch(first: PixelBox, second: PixelBox, tolerancePx: number): boolean {
  const separatedHorizontally =
    first.right + tolerancePx < second.left || second.right + tolerancePx < first.left;
  const separatedVertically =
    first.bottom + tolerancePx < second.top || second.bottom + tolerancePx < first.top;
  return !separatedHorizontally && !separatedVertically;
}

function centreCloseness(box: PixelBox, frame: FrameSize): number {
  const boxCentreX = (box.left + box.right) / 2;
  const boxCentreY = (box.top + box.bottom) / 2;
  const dx = (boxCentreX - frame.width / 2) / (frame.width / 2);
  const dy = (boxCentreY - frame.height / 2) / (frame.height / 2);
  const normalisedDistance = Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT2);
  return 1 - normalisedDistance;
}

function areaFraction(box: PixelBox, frame: FrameSize): number {
  const boxArea = Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
  return boxArea / (frame.width * frame.height);
}

// Two detections of different concepts ("bowl" and "glass bowl") often cover the
// same object. Treat boxes overlapping this much as duplicates.
function intersectionOverUnion(first: PixelBox, second: PixelBox): number {
  const overlapWidth = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const overlapHeight = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  const overlapArea = overlapWidth * overlapHeight;
  const firstArea = (first.right - first.left) * (first.bottom - first.top);
  const secondArea = (second.right - second.left) * (second.bottom - second.top);
  const unionArea = firstArea + secondArea - overlapArea;
  return unionArea > 0 ? overlapArea / unionArea : 0;
}

export function selectReferent(
  candidateDetections: SamDetection[],
  handDetections: SamDetection[],
  frame: FrameSize,
): MaskSelectionResult {
  const tolerancePx = frame.width * TOUCH_TOLERANCE_FRACTION;

  const scored: ScoredDetection[] = candidateDetections.map((detection) => {
    const touchesHand = handDetections.some((hand) => boxesTouch(detection.box, hand.box, tolerancePx));
    const closeness = centreCloseness(detection.box, frame);
    const area = areaFraction(detection.box, frame);
    const score =
      (touchesHand ? WEIGHT_TOUCHES_HAND : 0) + WEIGHT_CENTRE * closeness + WEIGHT_AREA * Math.min(1, area * 4);

    const reasons: string[] = [];
    if (touchesHand) reasons.push("touches a hand");
    reasons.push(`centre closeness ${closeness.toFixed(2)}`);
    reasons.push(`covers ${(area * 100).toFixed(1)}% of frame`);
    if (detection.confidence !== null) reasons.push(`SAM confidence ${detection.confidence.toFixed(2)}`);

    return { detection, touchesHand, centreCloseness: closeness, areaFraction: area, score, reasons };
  });

  // Highest score first; drop near-duplicates of a better-ranked box.
  const ranked: ScoredDetection[] = [];
  for (const candidate of scored.sort((first, second) => second.score - first.score)) {
    const isDuplicate = ranked.some((kept) => intersectionOverUnion(kept.detection.box, candidate.detection.box) > 0.8);
    if (!isDuplicate) ranked.push(candidate);
  }

  const chosen = ranked[0] ?? null;
  const runnerUp = ranked[1];
  const selectionMargin = chosen && runnerUp ? chosen.score - runnerUp.score : chosen ? chosen.score : 0;
  return { chosen, ranked, selectionMargin };
}
