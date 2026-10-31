// Shared data model. Mirrors PRD Section 9; change both together.

export type Seconds = number;

export interface VideoMeta {
  id: string;
  title: string;
  domainHint: string | null;      // e.g. "cooking", used for keyword biasing
  sourcePath: string;
  durationSec: Seconds;
  fps: number;
  width: number;
  height: number;
  licence: string;                 // e.g. "Pexels License" or "CC BY 4.0"
  attribution: string;             // credit line for CREDITS.md
  status: "uploaded" | "processing" | "ready_for_review" | "published" | "failed";
}

export interface Turn {
  id: string;
  speaker: string;
  start: Seconds;
  end: Seconds;
  text: string;
}

export interface Gap {
  start: Seconds;
  end: Seconds;
  durationSec: Seconds;
}

export type ReferenceKind = "object" | "state" | "location" | "amount" | "action";

export interface ReferenceCandidate {
  id: string;
  turnId: string;
  phrase: string;                  // e.g. "this", "like this"
  charOffset: number;
  isVisualReference: boolean;      // from F3 stage B
  kind: ReferenceKind | null;
  classifierReason: string;
}

export interface LocalisedReference {
  referenceId: string;
  estimatedTime: Seconds;          // proportional estimate (F4 step 1)
  refinedTime: Seconds;            // after visual refinement (F4 step 2)
  bestFramePath: string;
  nounPhraseGuess: string;
}

export interface MaskEvidence {
  framePath: string;
  maskPath: string;                // PNG mask, or RLE stored in JSON
  box: [number, number, number, number]; // x, y, w, h in pixels
  samScore: number;
  selectionReasons: string[];      // e.g. ["touches hand", "moved during window"]
  selectionMargin: number;
}

export interface Resolution {
  referenceId: string;
  resolvedText: string | null;     // null when abstained
  specificity: "specific" | "generic" | null;
  usedGlossaryEntry: string | null;
  confidence: number;              // combined 0-1 (F7)
  bucket: "ready" | "needs_review" | "abstain";
  topCandidates: string[];         // shown to reviewer when abstained
  evidence: MaskEvidence | null;
}

export interface OnScreenText {
  id: string;
  time: Seconds;
  text: string;
  alreadySpoken: boolean;
}

export interface Cue {
  id: string;
  sourceType: "reference" | "onscreen_text";
  sourceId: string;
  start: Seconds;
  shortText: string;
  longText: string;
  delivery: "inline" | "extended";
  reviewStatus: "draft" | "approved" | "edited" | "rejected";
  finalText: string | null;
}

export interface ReviewEdit {
  cueId: string;
  before: string;
  after: string;
  at: string;                      // ISO timestamp
}

export interface EvalReferenceLabel {
  videoId: string;
  time: Seconds;                   // approximate time of the spoken reference
  phrase: string;
  isVisual: boolean;
  trueReferent: string;            // human label, e.g. "the bowl of sugar"
  acceptableAlternatives: string[];
}
