// PRD 12.5: F6. Name the referent specifically, using whole-video context.
//
// Called twice per reference for self-consistency (F7), with different views:
//   "frame_and_overlay": the frame, then the frame with boxes (temperature 0)
//   "overlay_and_crop":  the frame with boxes, then a close-up of the green box (temperature 0.7)
//   "frame_only":        no SAM evidence; just a frame (the second call uses a neighbouring frame)
// For actions, both calls first get the 2 fps frames around the moment.
//
// Changes from the PRD draft (M0 lessons, see DECISIONS.md):
//   - evidenceMatches: Spark must say whether the green box is the referent.
//     In M0 it noticed the wrong jar in its note but stayed 0.9 confident.
//   - "the presenter" / "a hand", never he/she (rule 5: observable only).
//   - glossary names of mixtures may be stale ("dry mix" for wet batter).

import { z } from "zod";
import { SHARED_DESCRIPTION_RULES } from "./sharedRules";

export const ResolveReferenceSchema = z.strictObject({
  resolvedText: z.string().nullable(),
  specificity: z.enum(["specific", "generic"]),
  usedGlossaryEntry: z.string().nullable(),
  evidenceMatches: z.boolean(),
  confidence: z.number(),
  uncertaintyNote: z.string().nullable(),
});

export type ResolveReferenceOutput = z.infer<typeof ResolveReferenceSchema>;

export type ResolveView = "frame_and_overlay" | "overlay_and_crop" | "frame_only";

export interface ResolveReferenceInput {
  transcriptContext: string; // timestamped transcript lines
  glossary: string | null;   // formatted glossary lines, or null if none
  sentence: string;
  phrase: string;
  kind: string;
  view: ResolveView;
  selectionReasons: string[] | null; // null when SAM found nothing
  // Actions only: times of the frame sequence sent BEFORE the view's images.
  // One frame can't show a movement (first eval: "fold it like this" became "a hand lifts").
  sequenceTimes: number[] | null;
}

export const resolveReferenceSystem = SHARED_DESCRIPTION_RULES;

function describeImages(view: ResolveView, selectionReasons: string[] | null, sequenceTimes: number[] | null): string {
  const reasons = selectionReasons?.join("; ") ?? "";
  const sequenceCount = sequenceTimes?.length ?? 0;
  const sequenceText =
    sequenceCount > 0
      ? `Images 1 to ${sequenceCount} are frames in time order (${sequenceTimes!.map((time) => `${time.toFixed(1)} s`).join(", ")}): use them to see the movement. `
      : "";
  const first = sequenceCount + 1;
  const second = sequenceCount + 2;
  switch (view) {
    case "frame_and_overlay":
      return `${sequenceText}Image ${first} is the key frame. Image ${second} is the same frame with a GREEN box around the region selected as the referent (yellow boxes are hands, red boxes are other candidates). The green region was selected because: ${reasons}.`;
    case "overlay_and_crop":
      return `${sequenceText}Image ${first} is the key frame with a GREEN box around the region selected as the referent (yellow boxes are hands, red boxes are other candidates). Image ${second} is a close-up of the green box. The green region was selected because: ${reasons}.`;
    case "frame_only":
      return `${sequenceText}No segmentation evidence: SAM did not find the object. Image ${first} is a plain key frame. Be more cautious, and set evidenceMatches to false.`;
  }
}

export function buildResolveReferencePrompt(input: ResolveReferenceInput): string {
  return `CONTEXT:
GLOSSARY (things named or shown in this video):
${input.glossary ?? "(none; use names the presenter says in the transcript)"}
Names of kind "mixture" may describe an earlier state ("the dry mix" before liquid was added). Use them only if they still fit what is visible now.

TRANSCRIPT EXCERPT (seconds: text):
${input.transcriptContext}

TASK: The presenter says "${input.sentence}". Resolve "${input.phrase}" (kind: ${input.kind}).
${describeImages(input.view, input.selectionReasons, input.sequenceTimes)}

- object/amount: give the most specific accurate name, using glossary names where they match. "the two cups of flour", not "white powder".
- state: describe the observable state (texture, colour, shape, level). No inference.
- location: describe where, relative to obvious landmarks ("onto the front left burner").
- action: describe the movement briefly and concretely.
Refer to people as "the presenter" or "a hand". Never guess gender.

evidenceMatches: true only if the green region shows what "${input.phrase}" refers to. For an action or a state, the green region marks the thing being acted on or the container holding the substance, so judge whether it marks that thing, not whether it shows the motion. If it shows something else (a different jar, the wrong hole), set false, explain in uncertaintyNote, and still give your best resolvedText from the images and transcript.
If you cannot tell what it is, set resolvedText to null.
confidence: 0 to 1, your honest probability that resolvedText is correct.

Reply with JSON: { "resolvedText": string|null, "specificity": "specific"|"generic", "usedGlossaryEntry": string|null, "evidenceMatches": boolean, "confidence": number, "uncertaintyNote": string|null }`;
}
