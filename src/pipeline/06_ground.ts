// Stage 06, ground (F5): WHICH pixels is the presenter talking about?
//
// For each localised reference:
//   1. cut a 3 s, 10 fps clip around the chosen moment
//   2. SAM 3.1 tracks three concepts through it, in parallel:
//        Spark's specific phrase ("glass jar of walnuts"),
//        the head noun ("jar"), and "hand"
//   3. selectReferent() picks one tracked object (specific phrase first, then
//      hand contact, motion, centre, size); the reasons are kept
//   4. write evidence: a box overlay JPEG and the mask (as COCO RLE)
//
// SAM's raw output text is cached per clip and concept, and re-parsed offline.
//
// Outputs: grounding.json (GroundingRecord[]), evidence/<id>.jpg (overlay),
// evidence/<id>.frame.jpg (the clip frame SAM boxed), evidence/<id>.mask.json, clips/<id>.mp4

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { decodeMaskToRLE, type RLEObject } from "@meta-sam/parser";
import { readJson, writeJson } from "../lib/cache";
import { mapWithConcurrency } from "../lib/concurrency";
import { cutVideoClip, drawBoxesOnImage, extractClipFrame, GROUNDING_CLIP_FPS, type BoxToDraw } from "../lib/ffmpeg";
import { selectReferent, type TrackFeatures } from "../lib/maskSelection";
import { parseVideoRawOutput, segmentVideoRaw, toTracks, type ObjectTrack, type PixelBox } from "../meta/sam";
import type { LocalisedReference, MaskEvidence, ReferenceCandidate, ReferenceKind } from "../types";
import type { Stage } from "./stage";
import { frameSize, readVideoMeta, videoPaths } from "./store";

const CLIP_HALF_WINDOW_SEC = 1.5;
const REFERENCE_CONCURRENCY = 4; // each reference makes 3 SAM calls in parallel
// SAM wants a short noun phrase; longer guesses are skipped in favour of the head noun.
const MAX_CONCEPT_WORDS = 6;
// SAM video pricing: $0.20 per 1,000 frames, billed at least 50 frames per request.
const SAM_DOLLARS_PER_FRAME = 0.2 / 1000;
const SAM_MIN_BILLED_FRAMES = 50;

export interface GroundingCandidate {
  concept: string;
  objectId: string;
  score: number;
  reasons: string[];
  features: TrackFeatures;
  box: PixelBox;
}

export interface GroundingRecord {
  referenceId: string;
  kind: ReferenceKind;
  clip: { path: string; startSec: number; fps: number; frameCount: number };
  bestFrameIndex: number;           // within the clip
  samFramePath: string;             // that clip frame as a JPEG; evidence is drawn on it
  concepts: { specific: string | null; headNoun: string; fallbacksTried: string[] };
  trackCounts: { specific: number; headNoun: number; hand: number }; // headNoun counts the fallback if one was used
  usedSpecificPhrase: boolean;
  candidates: GroundingCandidate[]; // best first
  evidence: MaskEvidence | null;    // null when SAM found nothing
}

interface MaskFile {
  referenceId: string;
  framePath: string;
  bounds: PixelBox; // the raster below covers exactly this box, in frame pixels
  rle: RLEObject;   // COCO RLE, size = [height, width] of the raster
}

function specificConceptFor(localised: LocalisedReference): string | null {
  const guess = localised.nounPhraseGuess.trim().toLowerCase();
  const head = localised.headNoun.trim().toLowerCase();
  const wordCount = guess.split(/\s+/).filter(Boolean).length;
  if (!guess || guess === head || wordCount > MAX_CONCEPT_WORDS) return null;
  return guess;
}

function conceptFileStem(concept: string): string {
  return concept.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
}

// Runs SAM video tracking for one concept, caching SAM's raw output text.
async function trackConcept(
  cacheDir: string,
  clipPath: string,
  clipStem: string,
  concept: string,
): Promise<{ tracks: ObjectTrack[]; calledApi: boolean }> {
  const cacheFile = path.join(cacheDir, "sam", `${clipStem}-${conceptFileStem(concept)}.txt`);
  let rawOutput: string;
  let calledApi = false;
  if (existsSync(cacheFile)) {
    rawOutput = await readFile(cacheFile, "utf8");
  } else {
    rawOutput = (await segmentVideoRaw(clipPath, concept)).rawOutput;
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, rawOutput);
    calledApi = true;
  }
  return { tracks: toTracks(parseVideoRawOutput(rawOutput), concept), calledApi };
}

function toXywh(box: PixelBox): [number, number, number, number] {
  return [Math.round(box.left), Math.round(box.top), Math.round(box.right - box.left), Math.round(box.bottom - box.top)];
}

export const groundStage: Stage = {
  id: "06",
  name: "ground",
  outputs: (videoId) => [videoPaths(videoId).grounding],

  async run(videoId) {
    const paths = videoPaths(videoId);
    const meta = await readVideoMeta(videoId);
    const references = await readJson<ReferenceCandidate[]>(paths.references);
    const localisedList = await readJson<LocalisedReference[]>(paths.localised);
    const size = await frameSize(videoId);
    const kindById = new Map(references.map((reference) => [reference.id, reference.kind]));

    let samCalls = 0;
    let costUsd = 0;

    const records = await mapWithConcurrency(localisedList, REFERENCE_CONCURRENCY, async (localised) => {
      const kind = kindById.get(localised.referenceId) ?? "object";

      // 1. A 3 s clip centred on the chosen moment (shifted, not shrunk, at the video's edges).
      const clipDuration = Math.min(2 * CLIP_HALF_WINDOW_SEC, meta.durationSec);
      const clipStart = Math.min(
        Math.max(0, localised.refinedTime - CLIP_HALF_WINDOW_SEC),
        meta.durationSec - clipDuration,
      );
      const clipStem = `${localised.referenceId}_${Math.round(clipStart * 1000)}`;
      const clipPath = path.join(paths.clipsDir, `${clipStem}.mp4`);
      if (!existsSync(clipPath)) await cutVideoClip(meta.sourcePath, clipStart, clipDuration, clipPath);
      const frameCount = Math.round(clipDuration * GROUNDING_CLIP_FPS);
      const bestFrameIndex = Math.min(frameCount - 1, Math.round((localised.refinedTime - clipStart) * GROUNDING_CLIP_FPS));

      // 2. Track the three concepts in parallel.
      const specificConcept = specificConceptFor(localised);
      const headNoun = localised.headNoun.trim().toLowerCase() || "object";
      const [specific, head, hands] = await Promise.all([
        specificConcept ? trackConcept(paths.cacheDir, clipPath, clipStem, specificConcept) : Promise.resolve(null),
        trackConcept(paths.cacheDir, clipPath, clipStem, headNoun),
        trackConcept(paths.cacheDir, clipPath, clipStem, "hand"),
      ]);
      const countCall = (call: { calledApi: boolean } | null) => {
        if (call?.calledApi) {
          samCalls += 1;
          costUsd += Math.max(SAM_MIN_BILLED_FRAMES, frameCount) * SAM_DOLLARS_PER_FRAME;
        }
      };
      [specific, head, hands].forEach(countCall);

      // 2b. Only if both found nothing: try Spark's fallback names, one by one,
      // until one finds something. They join the head-noun tier.
      const fallbackConceptsTried: string[] = [];
      let headNounTracks = head.tracks;
      if ((specific?.tracks.length ?? 0) === 0 && headNounTracks.length === 0) {
        for (const fallback of localised.alternativeConcepts) {
          const concept = fallback.trim().toLowerCase();
          if (!concept || concept === headNoun || concept === specificConcept) continue;
          fallbackConceptsTried.push(concept);
          const fallbackCall = await trackConcept(paths.cacheDir, clipPath, clipStem, concept);
          countCall(fallbackCall);
          if (fallbackCall.tracks.length > 0) {
            headNounTracks = fallbackCall.tracks;
            break;
          }
        }
      }

      // 3. Choose.
      const selection = selectReferent({
        specificTracks: specific?.tracks ?? [],
        headNounTracks,
        handTracks: hands.tracks,
        bestFrameIndex,
        frameSize: size,
        kind,
      });

      // 4. Evidence: overlay (green = chosen, yellow = hands, red = other candidates) and mask,
      // drawn on the exact clip frame SAM boxed (not the nearest 2 fps frame: see DECISIONS.md).
      const samFramePath = path.join(paths.evidenceDir, `${localised.referenceId}.frame.jpg`);
      await extractClipFrame(clipPath, bestFrameIndex, samFramePath);
      const overlayPath = path.join(paths.evidenceDir, `${localised.referenceId}.jpg`);
      const handBoxes = hands.tracks
        .map((track) => track.boxes.find((trackedBox) => trackedBox.frameIndex === bestFrameIndex))
        .filter((trackedBox) => trackedBox !== undefined);
      const boxesToDraw: BoxToDraw[] = [
        ...selection.ranked.slice(1).map((other) => ({ box: other.boxAtBestFrame.box, colour: "red", thickness: 2 })),
        ...handBoxes.map((handBox) => ({ box: handBox.box, colour: "yellow", thickness: 3 })),
        ...(selection.chosen ? [{ box: selection.chosen.boxAtBestFrame.box, colour: "lime", thickness: 6 }] : []),
      ];
      await drawBoxesOnImage(samFramePath, overlayPath, boxesToDraw);

      let evidence: MaskEvidence | null = null;
      if (selection.chosen) {
        const chosenBox = selection.chosen.boxAtBestFrame;
        const maskPath = path.join(paths.evidenceDir, `${localised.referenceId}.mask.json`);
        if (chosenBox.mask) {
          const maskFile: MaskFile = {
            referenceId: localised.referenceId,
            framePath: samFramePath,
            bounds: chosenBox.box,
            rle: decodeMaskToRLE(chosenBox.mask),
          };
          await writeJson(maskPath, maskFile);
        }
        evidence = {
          framePath: overlayPath,
          maskPath: chosenBox.mask ? maskPath : "",
          box: toXywh(chosenBox.box),
          samScore: selection.chosen.features.samConfidence ?? 0,
          selectionReasons: selection.chosen.reasons,
          selectionMargin: selection.selectionMargin,
        };
      }

      const record: GroundingRecord = {
        referenceId: localised.referenceId,
        kind,
        clip: { path: clipPath, startSec: clipStart, fps: GROUNDING_CLIP_FPS, frameCount },
        bestFrameIndex,
        samFramePath,
        concepts: { specific: specificConcept, headNoun, fallbacksTried: fallbackConceptsTried },
        trackCounts: { specific: specific?.tracks.length ?? 0, headNoun: headNounTracks.length, hand: hands.tracks.length },
        usedSpecificPhrase: selection.usedSpecificPhrase,
        candidates: selection.ranked.map((scored) => ({
          concept: scored.track.concept,
          objectId: scored.track.objectId,
          score: Math.round(scored.score * 1000) / 1000,
          reasons: scored.reasons,
          features: scored.features,
          box: scored.boxAtBestFrame.box,
        })),
        evidence,
      };
      return record;
    });

    await writeJson(paths.grounding, records);
    const grounded = records.filter((record) => record.evidence !== null).length;
    const viaSpecific = records.filter((record) => record.usedSpecificPhrase).length;
    return {
      summary: `${grounded}/${records.length} grounded (${viaSpecific} via specific phrase), ${samCalls} SAM calls`,
      costUsd,
    };
  },
};
