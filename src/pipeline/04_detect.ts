// Stage 04, detect (F3): which "this"/"that"/"here" point at something on screen?
//
//   Stage A (deterministic): findDeicticCandidates() finds every possible phrase.
//   Stage B (Muse Spark): for each candidate, look at the sentence, its
//   neighbours and 4 frames spanning it, and decide: visual (exophoric) or not.
//
// Output: references.json, every candidate (visual or not) as ReferenceCandidate,
// so the eval can measure both misses and false alarms.

import { readJson, writeJson } from "../lib/cache";
import { mapWithConcurrency } from "../lib/concurrency";
import { findDeicticCandidates, markPhraseInText, type DeicticMatch } from "../lib/deixis";
import { framePath, frameNumbersSpanningTurn, timeOfFrameNumber } from "../lib/localise";
import {
  buildClassifyReferencePrompt,
  ClassifyReferenceSchema,
  classifyReferenceSystem,
} from "../prompts/classifyReference";
import type { ReferenceCandidate, Turn } from "../types";
import { cachedSpark, sparkCostUsd } from "./sparkCache";
import type { Stage } from "./stage";
import { countFrames, videoPaths } from "./store";

const CLASSIFY_CONCURRENCY = 8;
const FRAMES_PER_CLASSIFICATION = 4;

export function referenceIdFor(match: DeicticMatch): string {
  return `${match.turnId}-c${match.charOffset}`;
}

export const detectStage: Stage = {
  id: "04",
  name: "detect",
  outputs: (videoId) => [videoPaths(videoId).references],

  async run(videoId) {
    const paths = videoPaths(videoId);
    const turns = await readJson<Turn[]>(paths.transcript);
    const totalFrames = await countFrames(videoId);

    // Stage A: every candidate phrase in every turn.
    const candidates = turns.flatMap((turn, turnIndex) =>
      findDeicticCandidates(turn).map((match) => ({ match, turn, turnIndex })),
    );

    // Stage B: classify each one, several at a time.
    let costUsd = 0;
    const references = await mapWithConcurrency(candidates, CLASSIFY_CONCURRENCY, async ({ match, turn, turnIndex }) => {
      const frameNumbers = frameNumbersSpanningTurn(turn, FRAMES_PER_CLASSIFICATION, totalFrames);
      const result = await cachedSpark(paths.cacheDir, {
        schemaName: "classify_reference",
        schema: ClassifyReferenceSchema,
        systemText: classifyReferenceSystem,
        userText: buildClassifyReferencePrompt({
          previousTurnText: turns[turnIndex - 1]?.text ?? null,
          markedTurnText: markPhraseInText(turn.text, match),
          nextTurnText: turns[turnIndex + 1]?.text ?? null,
          frameTimes: frameNumbers.map(timeOfFrameNumber),
        }),
        imagePaths: frameNumbers.map((frameNumber) => framePath(paths.framesDir, frameNumber)),
        temperature: 0,
      });
      costUsd += sparkCostUsd(result.usage);

      const isVisual = result.data.isVisualReference && result.data.referenceKind !== null;
      const reference: ReferenceCandidate = {
        id: referenceIdFor(match),
        turnId: turn.id,
        phrase: match.phrase,
        charOffset: match.charOffset,
        isVisualReference: isVisual,
        kind: isVisual ? result.data.referenceKind : null,
        classifierReason: result.data.reason,
      };
      return reference;
    });

    await writeJson(paths.references, references);
    const visualCount = references.filter((reference) => reference.isVisualReference).length;
    return {
      summary: `${candidates.length} candidates, ${visualCount} visual references`,
      costUsd,
    };
  },
};
