// PRD 12.4: the glossary (F6 context pack). Built once per video, cached.
// Gives the resolver the presenter's own names for things ("the walnuts"),
// even when the sentence with "this" doesn't name them.
//
// `kind` was added after the M0 spike: Spark reused "the dry mix" for wet
// batter because the presenter said "that's the dry mix done" earlier. Marking
// mixtures lets the resolver treat their names as possibly stale.

import { z } from "zod";

export const GlossarySchema = z.strictObject({
  entities: z.array(
    z.strictObject({
      name: z.string(),
      aliases: z.array(z.string()),
      kind: z.enum(["tool", "ingredient", "container", "part", "material", "mixture", "other"]),
      firstSeenSec: z.number(),
      mentionedInSpeech: z.boolean(),
    }),
  ),
});

export type GlossaryOutput = z.infer<typeof GlossarySchema>;

export interface GlossaryInput {
  transcriptLines: string;  // "12.3: text" per turn
  keyframeTimes: number[];  // seconds, one per attached image, in order
}

export function buildGlossaryPrompt(input: GlossaryInput): string {
  const keyframeList = input.keyframeTimes.map((time, index) => `Image ${index}: ${time.toFixed(1)} s`).join("\n");
  return `TASK: From this full transcript of a how-to video and these keyframes, list every tool, ingredient, container, part, material and amount that appears in the video.

TRANSCRIPT (seconds: text):
${input.transcriptLines}

KEYFRAMES (in time order):
${keyframeList}

For each entity:
- name: the presenter's own words if they name it ("the walnuts"); otherwise a short, accurate visual name ("a cream mixing bowl"). Never invent a brand or a specific ingredient you cannot see or hear.
- aliases: other names used for the same thing.
- kind: tool | ingredient | container | part | material | mixture | other. Use "mixture" for anything whose state changes during the video (batter, dough, dry mix, glue); its name may only fit for part of the video.
- firstSeenSec: when it first appears or is first mentioned.
- mentionedInSpeech: true only if the presenter says its name.

List each physical thing once. Do not list people, hands, or the room.

Reply with JSON: { "entities": [ { "name": string, "aliases": string[], "kind": string, "firstSeenSec": number, "mentionedInSpeech": boolean } ] }`;
}
