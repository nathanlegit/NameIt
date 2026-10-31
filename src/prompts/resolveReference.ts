// PRD 12.5: F6. Name the referent specifically, using whole-video context.
// The spike passes the full transcript in place of the glossary (built in M2).

import { z } from "zod";
import { SHARED_DESCRIPTION_RULES } from "./sharedRules";

export const ResolveReferenceSchema = z.strictObject({
  resolvedText: z.string().nullable(),
  specificity: z.enum(["specific", "generic"]),
  usedGlossaryEntry: z.string().nullable(),
  confidence: z.number(),
  uncertaintyNote: z.string().nullable(),
});

export type ResolveReferenceOutput = z.infer<typeof ResolveReferenceSchema>;

export interface ResolveReferenceInput {
  transcriptContext: string; // timestamped transcript lines
  glossary: string | null;   // null in the spike
  sentence: string;
  phrase: string;
  kind: string;
  selectionReasons: string[] | null; // null when SAM found nothing
}

export const resolveReferenceSystem = SHARED_DESCRIPTION_RULES;

export function buildResolveReferencePrompt(input: ResolveReferenceInput): string {
  const evidenceText =
    input.selectionReasons === null
      ? `No segmentation evidence: SAM did not find the object. Only the plain frame is attached. Be more cautious.`
      : `Image 1 is the frame. Image 2 is the same frame with a GREEN box around the region selected as the referent (yellow boxes are hands, red boxes are other candidates). The green region was selected because: ${input.selectionReasons.join("; ")}.`;

  return `CONTEXT:
GLOSSARY: ${input.glossary ?? "(not available; use names the presenter says in the transcript)"}
TRANSCRIPT (seconds: text):
${input.transcriptContext}

TASK: The presenter says "${input.sentence}". Resolve "${input.phrase}" (kind: ${input.kind}).
${evidenceText}

- object/amount: give the most specific accurate name, using names the presenter uses elsewhere where they match. "the two cups of flour", not "white powder".
- state: describe the observable state (texture, colour, shape, level). No inference.
- location: describe where, relative to obvious landmarks ("onto the front left burner").
- action: describe the movement briefly and concretely.
If the highlighted region does not look like what the presenter is referring to, say so in uncertaintyNote and lower confidence.
If you cannot tell, set resolvedText to null.

confidence: 0 to 1, your honest probability that resolvedText is correct.

Reply with JSON: { "resolvedText": string|null, "specificity": "specific"|"generic", "usedGlossaryEntry": string|null, "confidence": number, "uncertaintyNote": string|null }`;
}
