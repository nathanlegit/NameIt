// Shared data model. Started from PRD Section 9 and has drifted on purpose
// (additions and removals are logged in docs/DECISIONS.md).

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
  headNoun: string;                // short SAM concept, e.g. "bowl" (added in M0, see DECISIONS.md)
  alternativeConcepts: string[];   // SAM fallbacks if the first two find nothing (added in M2)
}

// Stage 03: things named or shown anywhere in the video (F6 context pack).
export type GlossaryKind = "tool" | "ingredient" | "container" | "part" | "material" | "mixture" | "other";

export interface GlossaryEntry {
  name: string;                    // the presenter's own name where they use one
  aliases: string[];
  kind: GlossaryKind;              // "mixture" names (batter, dry mix) can go stale as the state changes
  firstSeenSec: Seconds;
  mentionedInSpeech: boolean;
}

export interface Keyframe {
  time: Seconds;
  framePath: string;
  reason: "scene_change" | "even_spacing";
}

export interface MaskEvidence {
  framePath: string;
  maskPath: string;                // evidence/<id>.mask.json (RLE + SVG outline), or "" if SAM gave no mask
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
  // Added in M3 (see DECISIONS.md): what the confidence is made of, for the review UI.
  secondAnswer: string | null;     // the self-consistency answer
  uncertaintyNote: string | null;  // Spark's own caveat
  confidenceNotes: string[];       // e.g. ["the two answers disagree"]
}

export interface Cue {
  id: string;
  sourceType: "reference";        // on-screen text cues (F8, P1) were never built
  sourceId: string;
  start: Seconds;                  // extended: the video pauses here
  shortText: string;
  longText: string;
  delivery: "inline" | "extended";
  // Added in M3 (see DECISIONS.md):
  end: Seconds;                    // inline: when speech ends; extended: same as start
  spokenDurationSec: Seconds;
  placementReason: string;         // e.g. "fits the 2.2 s gap at 5.9 s"
  bucket: Resolution["bucket"];    // the player's "auto" mode speaks ready cues unreviewed
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
