// F5: choose WHICH object SAM tracked is the thing the presenter means.
//
// SAM finds every "jar" in the clip and follows each one through time; it
// doesn't know which jar "that jar" is. We decide with explicit rules, and keep
// the reasons so the review UI can show why.
//
//   Tier rule. If SAM found anything for Spark's SPECIFIC description
//   ("glass jar of walnuts"), only those objects are candidates. A head-noun
//   match ("jar") is the fallback. (The M0 spike picked a background jar that
//   touched a hand; the specific phrase matched only the right jar.)
//
//   Then a weighted score, highest wins:
//     1. touches a hand: share of frames where its box touches a hand box.
//        Weighted by reference kind: strong for held things, weak for places.
//     2. moves: how far its box travels or changes size during the window.
//     3. near the centre of the frame, then larger, then SAM's confidence.
//
// Limitation: motion is measured in screen space, so a moving camera makes
// everything "move". Fine for how-to videos, which are mostly steady shots.
//
// Pure functions only, so this is unit-tested without the API.

import type { ObjectTrack, PixelBox, TrackedBox } from "../meta/sam";
import type { ReferenceKind } from "../types";

export interface FrameSize {
  width: number;
  height: number;
}

export interface SelectionInput {
  specificTracks: ObjectTrack[];  // SAM results for Spark's full noun phrase
  headNounTracks: ObjectTrack[];  // SAM results for the head noun ("jar")
  handTracks: ObjectTrack[];      // SAM results for "hand"
  bestFrameIndex: number;         // the frame (within the clip) Spark chose
  frameSize: FrameSize;
  kind: ReferenceKind;
}

export interface TrackFeatures {
  matchesSpecificPhrase: boolean;
  handContactFraction: number; // 0 to 1
  motionScore: number;         // 0 to 1
  centreCloseness: number;     // 1 = dead centre, 0 = a corner
  areaFraction: number;        // share of the frame its box covers, at the best frame
  samConfidence: number | null;
}

export interface ScoredTrack {
  track: ObjectTrack;
  boxAtBestFrame: TrackedBox;  // the evidence box (nearest frame if hidden at the best one)
  features: TrackFeatures;
  score: number;
  reasons: string[];
}

export interface SelectionResult {
  chosen: ScoredTrack | null;
  ranked: ScoredTrack[];        // every candidate, best first
  usedSpecificPhrase: boolean;  // was the tier rule applied?
  selectionMargin: number;      // chosen score minus runner-up (chosen score if alone)
}

// How much hand contact matters, by what kind of thing "this" refers to.
// You hold the spoonful you mean; you rarely hold "right there".
// All weights here are untuned first guesses (the eval set is too small to tune
// them without overfitting; see docs/DECISIONS.md).
export const HAND_WEIGHT_BY_KIND: Record<ReferenceKind, number> = {
  object: 1.0,
  amount: 1.0,
  action: 1.0,
  state: 0.6,
  location: 0.3,
};
const WEIGHT_MOTION = 0.5;
const WEIGHT_CENTRE = 0.3;
const WEIGHT_AREA = 0.2;
const WEIGHT_CONFIDENCE = 0.2;

// Boxes this close to a hand box (as a share of frame width) count as touching.
const TOUCH_TOLERANCE_FRACTION = 0.02;
// Moving 5% of the frame diagonal (about 73 px at 1280x720) counts as full motion.
const FULL_MOTION_DIAGONAL_FRACTION = 0.05;
// Tracks from two concepts covering the same object ("jar" and "glass jar of
// walnuts") overlap at least this much and are merged into one candidate.
const SAME_OBJECT_IOU = 0.7;

// --- Geometry ----------------------------------------------------------------

export function boxesTouch(first: PixelBox, second: PixelBox, tolerancePx: number): boolean {
  const separatedHorizontally = first.right + tolerancePx < second.left || second.right + tolerancePx < first.left;
  const separatedVertically = first.bottom + tolerancePx < second.top || second.bottom + tolerancePx < first.top;
  return !separatedHorizontally && !separatedVertically;
}

export function intersectionOverUnion(first: PixelBox, second: PixelBox): number {
  const overlapWidth = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const overlapHeight = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  const overlapArea = overlapWidth * overlapHeight;
  const unionArea = boxArea(first) + boxArea(second) - overlapArea;
  return unionArea > 0 ? overlapArea / unionArea : 0;
}

function boxArea(box: PixelBox): number {
  return Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
}

function boxCentre(box: PixelBox): { x: number; y: number } {
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
}

function centreCloseness(box: PixelBox, frame: FrameSize): number {
  const centre = boxCentre(box);
  const dx = (centre.x - frame.width / 2) / (frame.width / 2);
  const dy = (centre.y - frame.height / 2) / (frame.height / 2);
  return 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT2);
}

// --- Per-track features ------------------------------------------------------

// The track's box at the best frame, or at the nearest frame where it's visible.
export function boxNearestFrame(track: ObjectTrack, frameIndex: number): TrackedBox | null {
  let nearest: TrackedBox | null = null;
  for (const trackedBox of track.boxes) {
    if (nearest === null || Math.abs(trackedBox.frameIndex - frameIndex) < Math.abs(nearest.frameIndex - frameIndex)) {
      nearest = trackedBox;
    }
  }
  return nearest;
}

// Share of the frames where this object is visible in which it touches any hand.
export function handContactFraction(track: ObjectTrack, handTracks: ObjectTrack[], frame: FrameSize): number {
  if (track.boxes.length === 0) return 0;
  const tolerancePx = frame.width * TOUCH_TOLERANCE_FRACTION;
  let framesTouching = 0;
  for (const trackedBox of track.boxes) {
    const handsInSameFrame = handTracks.flatMap((hand) =>
      hand.boxes.filter((handBox) => handBox.frameIndex === trackedBox.frameIndex),
    );
    if (handsInSameFrame.some((handBox) => boxesTouch(trackedBox.box, handBox.box, tolerancePx))) {
      framesTouching += 1;
    }
  }
  return framesTouching / track.boxes.length;
}

// How much the object moved or changed size over the window, scaled 0 to 1.
export function motionScore(track: ObjectTrack, frame: FrameSize): number {
  if (track.boxes.length < 2) return 0;
  const centres = track.boxes.map((trackedBox) => boxCentre(trackedBox.box));
  const xs = centres.map((centre) => centre.x);
  const ys = centres.map((centre) => centre.y);
  const travelPx = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));

  // Size change catches things moving towards or away from the camera.
  const areas = track.boxes.map((trackedBox) => Math.max(1, boxArea(trackedBox.box)));
  const sizeChangeRatio = Math.max(...areas) / Math.min(...areas);
  const sizeChangeAsTravel = (Math.sqrt(sizeChangeRatio) - 1) * Math.sqrt(Math.min(...areas));

  const frameDiagonal = Math.hypot(frame.width, frame.height);
  const effectiveTravel = Math.max(travelPx, sizeChangeAsTravel);
  return Math.min(1, effectiveTravel / (frameDiagonal * FULL_MOTION_DIAGONAL_FRACTION));
}

function meanConfidence(track: ObjectTrack): number | null {
  const values = track.boxes.map((trackedBox) => trackedBox.confidence).filter((value): value is number => value !== null);
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

// --- Merging and scoring -----------------------------------------------------

interface Candidate {
  track: ObjectTrack;
  matchesSpecificPhrase: boolean;
}

// Merges the specific-phrase and head-noun tracks, dropping head-noun tracks
// that are the same object as a specific-phrase track.
function mergeCandidates(input: SelectionInput): Candidate[] {
  const candidates: Candidate[] = input.specificTracks.map((track) => ({ track, matchesSpecificPhrase: true }));
  for (const headTrack of input.headNounTracks) {
    const headBox = boxNearestFrame(headTrack, input.bestFrameIndex);
    const isDuplicate = candidates.some((existing) => {
      const existingBox = boxNearestFrame(existing.track, input.bestFrameIndex);
      return headBox !== null && existingBox !== null && intersectionOverUnion(headBox.box, existingBox.box) >= SAME_OBJECT_IOU;
    });
    if (!isDuplicate) candidates.push({ track: headTrack, matchesSpecificPhrase: false });
  }
  return candidates;
}

function scoreCandidate(candidate: Candidate, input: SelectionInput): ScoredTrack | null {
  const boxAtBestFrame = boxNearestFrame(candidate.track, input.bestFrameIndex);
  if (boxAtBestFrame === null) return null;

  const features: TrackFeatures = {
    matchesSpecificPhrase: candidate.matchesSpecificPhrase,
    handContactFraction: handContactFraction(candidate.track, input.handTracks, input.frameSize),
    motionScore: motionScore(candidate.track, input.frameSize),
    centreCloseness: centreCloseness(boxAtBestFrame.box, input.frameSize),
    areaFraction: boxArea(boxAtBestFrame.box) / (input.frameSize.width * input.frameSize.height),
    samConfidence: meanConfidence(candidate.track),
  };

  const handWeight = HAND_WEIGHT_BY_KIND[input.kind];
  const score =
    handWeight * features.handContactFraction +
    WEIGHT_MOTION * features.motionScore +
    WEIGHT_CENTRE * features.centreCloseness +
    WEIGHT_AREA * Math.min(1, features.areaFraction * 4) +
    WEIGHT_CONFIDENCE * (features.samConfidence ?? 0);

  const reasons: string[] = [];
  if (features.matchesSpecificPhrase) reasons.push(`matches "${candidate.track.concept}"`);
  if (features.handContactFraction > 0) {
    reasons.push(`touches a hand in ${Math.round(features.handContactFraction * 100)}% of frames`);
  }
  if (features.motionScore >= 0.2) reasons.push(`moves during the moment (${features.motionScore.toFixed(2)})`);
  reasons.push(`centre closeness ${features.centreCloseness.toFixed(2)}`);
  reasons.push(`covers ${(features.areaFraction * 100).toFixed(1)}% of frame`);
  if (features.samConfidence !== null) reasons.push(`SAM confidence ${features.samConfidence.toFixed(2)}`);

  return { track: candidate.track, boxAtBestFrame, features, score, reasons };
}

export function selectReferent(input: SelectionInput): SelectionResult {
  const allCandidates = mergeCandidates(input);
  const specificCandidates = allCandidates.filter((candidate) => candidate.matchesSpecificPhrase);
  const usedSpecificPhrase = specificCandidates.length > 0;
  const pool = usedSpecificPhrase ? specificCandidates : allCandidates;

  const ranked = pool
    .map((candidate) => scoreCandidate(candidate, input))
    .filter((scored): scored is ScoredTrack => scored !== null)
    .sort((first, second) => second.score - first.score);

  const chosen = ranked[0] ?? null;
  const runnerUp = ranked[1];
  const selectionMargin = chosen === null ? 0 : runnerUp ? chosen.score - runnerUp.score : chosen.score;
  return { chosen, ranked, usedSpecificPhrase, selectionMargin };
}
