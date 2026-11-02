// PRD 12.6: F9 cue writer. Turns a resolution into a short and a long cue.
//
// Change from the PRD draft: the example's long cue said "She tips...", which
// breaks rule 5 (no inferred gender). It now says "A hand tips...".

import { z } from "zod";
import { SHARED_DESCRIPTION_RULES } from "./sharedRules";

export const WriteCueSchema = z.strictObject({
  short: z.string(),
  long: z.string(),
});

export type WriteCueOutput = z.infer<typeof WriteCueSchema>;

export interface WriteCueInput {
  sentence: string;
  phrase: string;
  kind: string;
  resolvedText: string;
  budgetWords: number;
}

export const writeCueSystem = SHARED_DESCRIPTION_RULES;

export function buildWriteCuePrompt(input: WriteCueInput): string {
  return `TASK: Write audio description for this moment.
The presenter says: "${input.sentence}"
"${input.phrase}" (kind: ${input.kind}) refers to: "${input.resolvedText}".
The image is the frame at this moment (if there is a green box, it marks the referent). Add only details you can see in it.

Short cue: at most ${input.budgetWords} words (hyphenated words count as separate words; never join words to fit). It is spoken in the pause right after the presenter's sentence, so it must make sense on its own and must not repeat the presenter's words. Keep the part that answers "${input.phrase}":
- object/amount: the name ("Two cups of flour.")
- state: the observable state ("Thick, glossy, smooth.")
- location: where ("Front left burner.")
- action: the movement, with its verb ("Pressing the soil flat.")
Long cue: at most 25 words. The video pauses while it is spoken, so it may add the action and where things are.
Refer to people as "the presenter" or "a hand". Never guess gender.

Example: sentence "Now add this", resolution "the two cups of flour" -> short "Two cups of flour.", long "A hand tips the two cups of flour into the large glass bowl."
Example: sentence "Fold it like this", resolution "a hand folds the dough edge over the centre" -> short "Edge folded to centre.", long "A hand lifts the far edge of the dough and folds it over to the centre."

Reply with JSON: { "short": string, "long": string }`;
}
