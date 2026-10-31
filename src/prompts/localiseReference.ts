// PRD 12.3: F4 step 2. Which frame in the window best shows the referent?
// Also asks for the noun phrase SAM will search for. headNoun was added to the
// PRD schema so we don't have to guess the head noun with string tricks.

import { z } from "zod";

export const LocaliseReferenceSchema = z.strictObject({
  bestFrameIndex: z.number().int(),
  nounPhraseGuess: z.string(), // e.g. "small glass bowl of white powder"
  headNoun: z.string(),        // e.g. "bowl": short, for SAM's concept prompt
  reason: z.string(),
});

export type LocaliseReferenceOutput = z.infer<typeof LocaliseReferenceSchema>;

export interface LocaliseReferenceInput {
  sentence: string;
  phrase: string;
  kind: string;
  frameTimes: number[];
}

export function buildLocaliseReferencePrompt(input: LocaliseReferenceInput): string {
  const frameList = input.frameTimes.map((time, index) => `Frame ${index}: ${time.toFixed(1)} s`).join("\n");
  return `TASK: The presenter says: "${input.sentence}". The word "${input.phrase}" refers to something visible (kind: ${input.kind}).
The attached frames are in time order at 0.5 s intervals:
${frameList}

Which frame best shows the thing "${input.phrase}" refers to being held, pointed at, placed or changed?

Also give:
- nounPhraseGuess: a short visual description of that thing, as specific as the pixels allow ("small glass bowl of white powder").
- headNoun: one or two words naming the physical object to segment ("bowl", "measuring cup", "screwdriver"). For a state or location, name the container or surface ("bowl", "pan", "chopping board").

Reply with JSON: { "bestFrameIndex": number, "nounPhraseGuess": string, "headNoun": string, "reason": string }`;
}
