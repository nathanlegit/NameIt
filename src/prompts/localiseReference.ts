// PRD 12.3: F4 step 2. Which frame in the window best shows the referent?
// Also asks for the phrases SAM will search for:
//   nounPhraseGuess      specific description ("glass jar of walnuts"), 6 words max
//   headNoun             one or two words ("jar")
//   alternativeConcepts  fallbacks, tried only if the first two find nothing
// (headNoun was added in M0; alternativeConcepts and the per-kind guidance in
// M2, after SAM found nothing for "spatula" covered in batter and Spark named
// the moving bag instead of the destination for "it goes in there".)

import { z } from "zod";

export const LocaliseReferenceSchema = z.strictObject({
  bestFrameIndex: z.number().int(),
  nounPhraseGuess: z.string(),
  headNoun: z.string(),
  alternativeConcepts: z.array(z.string()),
  reason: z.string(),
});

export type LocaliseReferenceOutput = z.infer<typeof LocaliseReferenceSchema>;

export interface LocaliseReferenceInput {
  sentence: string;
  phrase: string;
  kind: string;
  frameTimes: number[];
}

// What the segmentable "thing" is for each kind of reference.
const TARGET_BY_KIND: Record<string, string> = {
  object: "the object being held, shown or used.",
  amount: "the tool or container holding the amount (the spoon, the cup), with what is in it.",
  state: "the container or tool holding the substance whose look is being shown (the bowl, the spatula), not the substance alone.",
  location: "the place or container where something is being put or placed (the bowl, the pan, the counter), NOT the thing being moved.",
  action: "the tool or object the action is done with or to.",
};

export function buildLocaliseReferencePrompt(input: LocaliseReferenceInput): string {
  const frameList = input.frameTimes.map((time, index) => `Frame ${index}: ${time.toFixed(1)} s`).join("\n");
  const target = TARGET_BY_KIND[input.kind] ?? TARGET_BY_KIND.object;
  return `TASK: The presenter says: "${input.sentence}". The word "${input.phrase}" refers to something visible (kind: ${input.kind}).
The attached frames are in time order at 0.5 s intervals:
${frameList}

Which frame best shows what "${input.phrase}" refers to? For this kind, the thing to find is ${target}

Also give the phrases a segmentation model will search for in that frame. It finds physical objects by name, and works poorly on shapeless stuff (batter, powder, liquid) on its own.
- nounPhraseGuess: a specific visual description of the thing, at most 6 words ("glass jar of walnuts", "metal spoon of white powder").
- headNoun: one or two words naming that physical object ("jar", "spoon", "mixing bowl").
- alternativeConcepts: up to 2 other short names (at most 3 words each) for the same object or the thing holding it, to try if the first two find nothing ("pink spatula", "bowl"). Can be empty.

Reply with JSON: { "bestFrameIndex": number, "nounPhraseGuess": string, "headNoun": string, "alternativeConcepts": string[], "reason": string }`;
}
