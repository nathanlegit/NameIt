// Stage 05, localise (F4): WHEN is the thing shown?
//
//   Step 1: estimate the word's time from its position in the turn's text.
//   Step 2: Muse Spark looks at the 2 fps frames within ±1.5 s and picks the
//           one that best shows the referent, plus a noun phrase for SAM.
//
// Output: localised.json (LocalisedReference[]), visual references only.

import { readJson, writeJson } from "../lib/cache";
import { mapWithConcurrency } from "../lib/concurrency";
import {
  estimateWordTime,
  framePath,
  frameNumbersInWindow,
  timeOfFrameNumber,
  windowAroundEstimate,
} from "../lib/localise";
import { buildLocaliseReferencePrompt, LocaliseReferenceSchema } from "../prompts/localiseReference";
import type { LocalisedReference, ReferenceCandidate, Turn } from "../types";
import { cachedSpark, sparkCostUsd } from "./sparkCache";
import type { Stage } from "./stage";
import { countFrames, readVideoMeta, videoPaths } from "./store";

const LOCALISE_CONCURRENCY = 8;

export const localiseStage: Stage = {
  id: "05",
  name: "localise",
  outputs: (videoId) => [videoPaths(videoId).localised],

  async run(videoId) {
    const paths = videoPaths(videoId);
    const meta = await readVideoMeta(videoId);
    const turns = await readJson<Turn[]>(paths.transcript);
    const references = await readJson<ReferenceCandidate[]>(paths.references);
    const totalFrames = await countFrames(videoId);
    const turnById = new Map(turns.map((turn) => [turn.id, turn]));
    const wholeVideo = { start: 0, end: meta.durationSec };

    const visualReferences = references.filter((reference) => reference.isVisualReference);
    let costUsd = 0;

    const localised = await mapWithConcurrency(visualReferences, LOCALISE_CONCURRENCY, async (reference) => {
      const turn = turnById.get(reference.turnId);
      if (!turn) throw new Error(`Reference ${reference.id} points at missing turn ${reference.turnId}.`);

      // Step 1: proportional estimate, then a window around it.
      const estimatedTime = estimateWordTime(turn, reference.charOffset);
      const windowFrameNumbers = frameNumbersInWindow(windowAroundEstimate(wholeVideo, estimatedTime), totalFrames);

      // Step 2: Spark picks the frame.
      const result = await cachedSpark(paths.cacheDir, {
        schemaName: "localise_reference",
        schema: LocaliseReferenceSchema,
        userText: buildLocaliseReferencePrompt({
          sentence: turn.text,
          phrase: reference.phrase,
          kind: reference.kind ?? "object",
          frameTimes: windowFrameNumbers.map(timeOfFrameNumber),
        }),
        imagePaths: windowFrameNumbers.map((frameNumber) => framePath(paths.framesDir, frameNumber)),
        temperature: 0,
      });
      costUsd += sparkCostUsd(result.usage);

      // Don't trust the index blindly: clamp it into the list we sent.
      const safeIndex = Math.min(Math.max(0, result.data.bestFrameIndex), windowFrameNumbers.length - 1);
      const bestFrameNumber = windowFrameNumbers[safeIndex]!;
      const localisedReference: LocalisedReference = {
        referenceId: reference.id,
        estimatedTime,
        refinedTime: timeOfFrameNumber(bestFrameNumber),
        bestFramePath: framePath(paths.framesDir, bestFrameNumber),
        nounPhraseGuess: result.data.nounPhraseGuess,
        headNoun: result.data.headNoun,
        alternativeConcepts: result.data.alternativeConcepts.slice(0, 2),
      };
      return localisedReference;
    });

    await writeJson(paths.localised, localised);
    const meanShift =
      localised.reduce((total, item) => total + Math.abs(item.refinedTime - item.estimatedTime), 0) /
      Math.max(1, localised.length);
    return {
      summary: `${localised.length} references localised, mean refinement ${meanShift.toFixed(2)} s`,
      costUsd,
    };
  },
};
