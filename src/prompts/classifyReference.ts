// PRD 12.2: F3 stage B. Is this "this" pointing at something on screen
// (exophoric) or back at earlier speech / an idea (anaphoric, non-visual)?

import { z } from "zod";
import { SHARED_DESCRIPTION_RULES } from "./sharedRules";

export const ClassifyReferenceSchema = z.strictObject({
  isVisualReference: z.boolean(),
  referenceKind: z.enum(["object", "state", "location", "amount", "action"]).nullable(),
  reason: z.string(),
});

export type ClassifyReferenceOutput = z.infer<typeof ClassifyReferenceSchema>;

export interface ClassifyReferenceInput {
  previousTurnText: string | null;
  markedTurnText: string; // current turn with the phrase wrapped in [[ ]]
  nextTurnText: string | null;
  frameTimes: number[];   // seconds, one per attached frame, in order
}

export const classifyReferenceSystem = SHARED_DESCRIPTION_RULES;

export function buildClassifyReferencePrompt(input: ClassifyReferenceInput): string {
  const frameList = input.frameTimes.map((time, index) => `Frame ${index}: ${time.toFixed(1)} s`).join("\n");
  return `TASK: Decide whether the word marked [[like this]] in the CURRENT TURN refers to something visible in the video (exophoric), or to earlier speech or an abstract idea (anaphoric / non-visual).

PREVIOUS TURN: ${input.previousTurnText ?? "(none)"}
CURRENT TURN: ${input.markedTurnText}
NEXT TURN: ${input.nextTurnText ?? "(none)"}

The attached images are frames spanning the current turn, in time order:
${frameList}

If it is visual, give referenceKind:
- object: a thing being held, shown or used
- amount: a quantity being shown ("this much")
- state: how something looks ("until it looks like this")
- location: a place ("put it right here")
- action: a movement or technique ("fold it this way")
If it is not visual, referenceKind is null.

Examples:
- "Now add [[this]] to the bowl" with a hand holding a cup of sugar -> visual, object
- "[[This]] recipe was my grandmother's" -> not visual
- "Whisk until it looks like [[this]]" -> visual, state
- "Put it right [[here]]" -> visual, location

Reply with JSON: { "isVisualReference": boolean, "referenceKind": "object"|"state"|"location"|"amount"|"action"|null, "reason": string }`;
}
