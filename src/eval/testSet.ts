// Which videos are in the eval, and which split each belongs to (PRD 13.1).
//
//   scripted:  stock footage + our own ElevenLabs narration. Used for tuning;
//              we wrote the references, so these numbers flatter the system.
//   held_out:  real narration (Prelinger films). Never used while tuning
//              prompts or thresholds. These are the headline numbers.
//
// Each video needs src/eval/labels/<videoId>.json and a processed
// data/videos/<videoId>/ (pnpm run pipeline <videoId>).

export type Split = "scripted" | "held_out";

export interface TestVideo {
  videoId: string;
  split: Split;
}

export const TEST_SET: TestVideo[] = [
  { videoId: "clip1", split: "scripted" },
  { videoId: "clip2", split: "scripted" },
  { videoId: "clip3", split: "scripted" },
  { videoId: "clip4", split: "scripted" },
  { videoId: "clip5", split: "scripted" },
  // Prelinger Archives excerpts, labelled before stages 03 to 09 ever ran on them.
  { videoId: "held-meat", split: "held_out" },
  { videoId: "held-watch", split: "held_out" },
];
