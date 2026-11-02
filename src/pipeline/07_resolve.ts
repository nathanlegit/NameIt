// Stage 07, resolve (F6 + F7): WHAT is "this", in words, and how sure are we?
//
// For each grounded reference, Muse Spark answers twice (self-consistency):
//   A: the frame + the box overlay, temperature 0
//   B: the box overlay + a close-up crop of the green box, temperature 0.7
// (without SAM evidence: A gets the best frame, B a frame 0.5 s later).
// Both get the glossary and ±30 s of transcript. For actions, both also get
// the 2 fps frames around the moment: one frame can't show a movement.
//
// combineConfidence() then turns Spark's confidence, the agreement between A
// and B, SAM's score and margin, and a glossary match into one confidence and
// a bucket: ready, needs_review or abstain.
//
// Outputs: resolutions.json (Resolution[]), evidence/<id>.crop.jpg

import path from "node:path";
import { combineConfidence } from "../lib/confidence";
import { readJson, writeJson } from "../lib/cache";
import { mapWithConcurrency } from "../lib/concurrency";
import { cropImage } from "../lib/ffmpeg";
import {
  framePath,
  frameNumberAtTime,
  frameNumbersInWindow,
  timeOfFrameNumber,
  windowAroundEstimate,
} from "../lib/localise";
import { findGlossaryMatch, nameAgreement } from "../lib/names";
import {
  buildResolveReferencePrompt,
  ResolveReferenceSchema,
  resolveReferenceSystem,
  type ResolveView,
} from "../prompts/resolveReference";
import type { GlossaryEntry, LocalisedReference, ReferenceCandidate, Resolution, Turn } from "../types";
import { transcriptAsLines } from "./03_context";
import type { GroundingRecord } from "./06_ground";
import { cachedSpark, sparkCostUsd } from "./sparkCache";
import type { Stage } from "./stage";
import { countFrames, frameSize, readVideoMeta, videoPaths } from "./store";

const RESOLVE_CONCURRENCY = 8;
const TRANSCRIPT_EXCERPT_SEC = 30;
const SECOND_ANSWER_TEMPERATURE = 0.7;
const NEIGHBOUR_FRAME_OFFSET_SEC = 0.5;

export function formatGlossary(glossary: GlossaryEntry[]): string | null {
  if (glossary.length === 0) return null;
  return glossary
    .map((entry) => {
      const aliases = entry.aliases.length > 0 ? `; also "${entry.aliases.join('", "')}"` : "";
      const source = entry.mentionedInSpeech ? "said aloud" : "only seen";
      return `- ${entry.name} (${entry.kind}${aliases}; ${source}; first at ${entry.firstSeenSec.toFixed(0)} s)`;
    })
    .join("\n");
}

function transcriptExcerpt(turns: Turn[], aroundTime: number): string {
  const nearby = turns.filter(
    (turn) => turn.end >= aroundTime - TRANSCRIPT_EXCERPT_SEC && turn.start <= aroundTime + TRANSCRIPT_EXCERPT_SEC,
  );
  return transcriptAsLines(nearby);
}

export const resolveStage: Stage = {
  id: "07",
  name: "resolve",
  outputs: (videoId) => [videoPaths(videoId).resolutions],

  async run(videoId) {
    const paths = videoPaths(videoId);
    const turns = await readJson<Turn[]>(paths.transcript);
    const glossary = await readJson<GlossaryEntry[]>(paths.glossary);
    const references = await readJson<ReferenceCandidate[]>(paths.references);
    const localisedList = await readJson<LocalisedReference[]>(paths.localised);
    const groundingList = await readJson<GroundingRecord[]>(paths.grounding);
    const totalFrames = await countFrames(videoId);
    const size = await frameSize(videoId);
    const meta = await readVideoMeta(videoId);
    const wholeVideo = { start: 0, end: meta.durationSec };

    const referenceById = new Map(references.map((reference) => [reference.id, reference]));
    const turnById = new Map(turns.map((turn) => [turn.id, turn]));
    const groundingById = new Map(groundingList.map((record) => [record.referenceId, record]));
    const glossaryText = formatGlossary(glossary);
    let costUsd = 0;

    const resolutions = await mapWithConcurrency(localisedList, RESOLVE_CONCURRENCY, async (localised) => {
      const reference = referenceById.get(localised.referenceId);
      const turn = reference ? turnById.get(reference.turnId) : undefined;
      if (!reference || !turn) throw new Error(`Reference ${localised.referenceId} has no matching candidate or turn.`);
      const grounding = groundingById.get(localised.referenceId);
      const evidence = grounding?.evidence ?? null;
      const chosenBox = grounding?.candidates[0]?.box;

      // The two views. With evidence: overlay + crop. Without: two plain frames.
      let viewA: { view: ResolveView; images: string[] };
      let viewB: { view: ResolveView; images: string[] };
      if (grounding && evidence && chosenBox) {
        // The clip frame SAM boxed, so the crop and overlay match the plain frame exactly.
        const cropPath = path.join(paths.evidenceDir, `${localised.referenceId}.crop.jpg`);
        await cropImage(grounding.samFramePath, cropPath, chosenBox, size);
        viewA = { view: "frame_and_overlay", images: [grounding.samFramePath, evidence.framePath] };
        viewB = { view: "overlay_and_crop", images: [evidence.framePath, cropPath] };
      } else {
        const neighbour = Math.min(totalFrames, frameNumberAtTime(localised.refinedTime + NEIGHBOUR_FRAME_OFFSET_SEC));
        viewA = { view: "frame_only", images: [localised.bestFramePath] };
        viewB = { view: "frame_only", images: [framePath(paths.framesDir, neighbour)] };
      }

      // Actions: also the 2 fps frames around the moment, the same ones Stage 05 saw.
      const sequenceFrameNumbers =
        reference.kind === "action"
          ? frameNumbersInWindow(windowAroundEstimate(wholeVideo, localised.estimatedTime), totalFrames)
          : [];
      const sequenceImages = sequenceFrameNumbers.map((frameNumber) => framePath(paths.framesDir, frameNumber));

      const ask = (view: ResolveView, images: string[], temperature: number) =>
        cachedSpark(paths.cacheDir, {
          schemaName: "resolve_reference",
          schema: ResolveReferenceSchema,
          systemText: resolveReferenceSystem,
          userText: buildResolveReferencePrompt({
            transcriptContext: transcriptExcerpt(turns, localised.refinedTime),
            glossary: glossaryText,
            sentence: turn.text,
            phrase: reference.phrase,
            kind: reference.kind ?? "object",
            view,
            selectionReasons: evidence?.selectionReasons ?? null,
            sequenceTimes: sequenceFrameNumbers.length > 0 ? sequenceFrameNumbers.map(timeOfFrameNumber) : null,
          }),
          imagePaths: [...sequenceImages, ...images],
          temperature,
        });
      const [answerA, answerB] = await Promise.all([
        ask(viewA.view, viewA.images, 0),
        ask(viewB.view, viewB.images, SECOND_ANSWER_TEMPERATURE),
      ]);
      costUsd += sparkCostUsd(answerA.usage) + sparkCostUsd(answerB.usage);
      const first = answerA.data;
      const second = answerB.data;

      // A glossary match earns a bonus, except for mixtures, whose names go stale.
      const glossaryEntry = findGlossaryMatch(first.resolvedText, first.usedGlossaryEntry, glossary);
      const combined = combineConfidence({
        answered: first.resolvedText !== null,
        sparkConfidence: (first.confidence + second.confidence) / 2,
        agreement: nameAgreement(first.resolvedText, second.resolvedText),
        samScore: evidence?.samScore ?? null,
        selectionMargin: evidence?.selectionMargin ?? null,
        evidenceMatches: first.evidenceMatches && second.evidenceMatches,
        glossaryMatch: glossaryEntry !== null && glossaryEntry.kind !== "mixture",
      });

      const answers = [first.resolvedText, second.resolvedText].filter((text): text is string => text !== null);
      const resolution: Resolution = {
        referenceId: localised.referenceId,
        resolvedText: combined.bucket === "abstain" ? null : first.resolvedText,
        specificity: first.resolvedText === null ? null : first.specificity,
        usedGlossaryEntry: glossaryEntry?.name ?? null,
        confidence: combined.confidence,
        bucket: combined.bucket,
        topCandidates: [...new Set(answers)],
        evidence,
        secondAnswer: second.resolvedText,
        uncertaintyNote: first.uncertaintyNote,
        confidenceNotes: combined.notes,
      };
      return resolution;
    });

    await writeJson(paths.resolutions, resolutions);
    const count = (bucket: Resolution["bucket"]) => resolutions.filter((resolution) => resolution.bucket === bucket).length;
    return {
      summary: `${resolutions.length} resolved: ${count("ready")} ready, ${count("needs_review")} needs review, ${count("abstain")} abstain`,
      costUsd,
    };
  },
};
