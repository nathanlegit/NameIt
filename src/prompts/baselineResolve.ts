// PRD 13.3: the no-grounding baseline. What a simpler system would do:
// show Spark the frames around the moment and the sentence, and ask what
// "this" is. No SAM, no glossary, no transcript context, no second answer.
// If Name It doesn't beat this, grounding isn't earning its cost.

import { z } from "zod";
import { SHARED_DESCRIPTION_RULES } from "./sharedRules";

export const BaselineResolveSchema = z.strictObject({
  resolvedText: z.string().nullable(),
  confidence: z.number(),
});

export type BaselineResolveOutput = z.infer<typeof BaselineResolveSchema>;

export interface BaselineResolveInput {
  sentence: string;
  phrase: string;
  kind: string;
  frameTimes: number[];
}

export const baselineResolveSystem = SHARED_DESCRIPTION_RULES;

export function buildBaselineResolvePrompt(input: BaselineResolveInput): string {
  const times = input.frameTimes.map((time) => `${time.toFixed(1)} s`).join(", ");
  return `TASK: The presenter says "${input.sentence}". Resolve "${input.phrase}" (kind: ${input.kind}).
The images are frames from around that moment, in time order (${times}).
- object/amount: give the most specific accurate name.
- state: describe the observable state.
- location: describe where, relative to obvious landmarks.
- action: describe the movement briefly and concretely.
If you cannot tell, set resolvedText to null.
confidence: 0 to 1, your honest probability that resolvedText is correct.

Reply with JSON: { "resolvedText": string|null, "confidence": number }`;
}
