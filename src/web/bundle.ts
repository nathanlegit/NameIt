// What the web app reads: one bundle.json per video, written by
// scripts/export-demo.ts into public/demo/<videoId>/.
//
// The pipeline's files are spread over a dozen JSON files; the UI wants one
// list of "items" (one per visual reference) with everything a reviewer needs.
// Paths here are URLs under /demo/<videoId>/, not file paths.

import type { Cue, ReferenceKind, Resolution, ReviewEdit, Seconds } from "../types";

export interface BundleBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface BundleEvidence {
  frameUrl: string;            // the clip frame SAM boxed
  overlayUrl: string;          // the same frame with boxes drawn (green, yellow, red)
  box: BundleBox;              // chosen object, in frame pixels
  maskPath: string | null;     // SVG path inside maskBounds (x = column, y = row)
  maskBounds: BundleBox | null;
  samScore: number;
  selectionMargin: number;
  reasons: string[];           // why this object was chosen
}

export interface BundleItem {
  referenceId: string;
  cueId: string;
  phrase: string;
  kind: ReferenceKind;
  sentence: { start: Seconds; end: Seconds; text: string; phraseOffset: number };
  previousText: string | null;
  nextText: string | null;
  estimatedTime: Seconds;      // when the word is said
  refinedTime: Seconds;        // when the thing is shown best
  evidence: BundleEvidence | null;
  rejectedCandidates: Array<{ concept: string; box: BundleBox }>; // the red boxes, best first
  resolution: Pick<
    Resolution,
    "resolvedText" | "specificity" | "usedGlossaryEntry" | "confidence" | "bucket" | "topCandidates" | "secondAnswer" | "uncertaintyNote" | "confidenceNotes"
  >;
  cue: Cue | null;             // null when abstained
}

export type ReviewStatus = "approved" | "edited" | "rejected";

export interface ReviewDecision {
  status: ReviewStatus;
  finalText: string | null;    // the text to speak (edited, or the draft as approved)
  at: string;                  // ISO time of the decision
}

// The human layer on top of the pipeline's cues. Kept separate from cues.json,
// so re-running the pipeline never wipes a reviewer's work.
export interface ReviewState {
  decisions: Record<string, ReviewDecision>; // by referenceId
  edits: ReviewEdit[];
  publishedAt: string | null;
}

export const EMPTY_REVIEW: ReviewState = { decisions: {}, edits: [], publishedAt: null };

export type Split = "scripted" | "held_out" | "other";

export interface VideoBundle {
  id: string;
  title: string;
  durationSec: Seconds;
  frameSize: { width: number; height: number };
  videoUrl: string;
  split: Split;
  syntheticNarration: boolean;
  licence: string;
  attribution: string;
  turns: Array<{ start: Seconds; end: Seconds; text: string }>;
  items: BundleItem[];
  review: ReviewState;
  cueAudio: Record<string, string>; // cueAudioKey(text) -> MP3 URL (F11b); empty if not rendered
}

export interface VideoSummary {
  id: string;
  title: string;
  durationSec: Seconds;
  split: Split;
  syntheticNarration: boolean;
  attribution: string;
  thumbUrl: string | null;     // an evidence frame, for the video list
  references: number;
  ready: number;
  needsReview: number;
  abstained: number;
  cues: number;
}
