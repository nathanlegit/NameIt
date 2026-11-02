// Stage 09, cues (F9): WHAT to say, and WHEN.
//
// For each resolution that isn't abstained:
//   1. find the nearest dialogue gap and its word budget (src/lib/placement.ts)
//   2. Muse Spark writes a short cue (within the budget) and a long cue (≤ 25 words)
//   3. placeCues() decides inline (spoken in the gap) or extended (pause the video)
// Abstained references get no cue: the viewer never hears a guess (F7).
//
// Outputs: cues.json (Cue[]), descriptions.vtt (WebVTT, kind="descriptions")

import { writeFile } from "node:fs/promises";
import { readJson, writeJson } from "../lib/cache";
import { mapWithConcurrency } from "../lib/concurrency";
import {
  budgetWords,
  findNearestGap,
  findOverlaps,
  inlineCueFitsSpeech,
  placeCues,
  wordCount,
  type CueRequest,
} from "../lib/placement";
import { toWebVtt } from "../lib/webvtt";
import { buildWriteCuePrompt, WriteCueSchema, writeCueSystem } from "../prompts/writeCue";
import type { Cue, Gap, LocalisedReference, ReferenceCandidate, Resolution, Turn } from "../types";
import { cachedSpark, sparkCostUsd } from "./sparkCache";
import type { Stage } from "./stage";
import { readVideoMeta, videoPaths, writeVideoMeta } from "./store";

const WRITE_CONCURRENCY = 8;
// Budget for the short cue when there's no gap nearby (it will be extended,
// but the reviewer can still pick the short text), and an upper limit for long gaps:
// a cue that names the thing should stay short even when there's room.
const DEFAULT_SHORT_BUDGET = 5;
const MAX_SHORT_BUDGET = 8;

export const cuesStage: Stage = {
  id: "09",
  name: "cues",
  outputs: (videoId) => [videoPaths(videoId).cues, videoPaths(videoId).descriptionsVtt],

  async run(videoId) {
    const paths = videoPaths(videoId);
    const turns = await readJson<Turn[]>(paths.transcript);
    const gaps = await readJson<Gap[]>(paths.gaps);
    const references = await readJson<ReferenceCandidate[]>(paths.references);
    const localisedList = await readJson<LocalisedReference[]>(paths.localised);
    const resolutions = await readJson<Resolution[]>(paths.resolutions);

    const referenceById = new Map(references.map((reference) => [reference.id, reference]));
    const localisedById = new Map(localisedList.map((localised) => [localised.referenceId, localised]));
    const turnById = new Map(turns.map((turn) => [turn.id, turn]));
    const speakable = resolutions.filter((resolution) => resolution.bucket !== "abstain" && resolution.resolvedText);
    let costUsd = 0;

    // 1 + 2: budget, then write.
    const written = await mapWithConcurrency(speakable, WRITE_CONCURRENCY, async (resolution) => {
      const reference = referenceById.get(resolution.referenceId);
      const localised = localisedById.get(resolution.referenceId);
      const turn = reference ? turnById.get(reference.turnId) : undefined;
      if (!reference || !localised || !turn) throw new Error(`Resolution ${resolution.referenceId} has no matching reference.`);

      const sentence = { start: turn.start, end: turn.end };
      const gap = findNearestGap(gaps, localised.estimatedTime, sentence);
      const budget = gap ? Math.min(MAX_SHORT_BUDGET, Math.max(1, budgetWords(gap.durationSec))) : DEFAULT_SHORT_BUDGET;
      const result = await cachedSpark(paths.cacheDir, {
        schemaName: "write_cue",
        schema: WriteCueSchema,
        systemText: writeCueSystem,
        userText: buildWriteCuePrompt({
          sentence: turn.text,
          phrase: reference.phrase,
          kind: reference.kind ?? "object",
          resolvedText: resolution.resolvedText!,
          budgetWords: budget,
        }),
        imagePaths: [resolution.evidence?.framePath ?? localised.bestFramePath],
        temperature: 0,
      });
      costUsd += sparkCostUsd(result.usage);

      const request: CueRequest = {
        id: `cue-${resolution.referenceId}`,
        referenceTime: localised.estimatedTime,
        sentence,
        shortText: result.data.short.trim(),
        longText: result.data.long.trim(),
      };
      return { request, resolution };
    });

    // 3: place them all together, so cues competing for a gap are resolved.
    const placed = placeCues(written.map((item) => item.request), gaps);
    const writtenById = new Map(written.map((item) => [item.request.id, item]));
    const cues: Cue[] = placed.map((placement) => {
      const { request, resolution } = writtenById.get(placement.id)!;
      return {
        id: placement.id,
        sourceType: "reference",
        sourceId: resolution.referenceId,
        start: placement.start,
        end: placement.end,
        shortText: request.shortText,
        longText: request.longText,
        delivery: placement.delivery,
        spokenDurationSec: placement.spokenDurationSec,
        placementReason: placement.reason,
        bucket: resolution.bucket,
      };
    });

    await writeJson(paths.cues, cues);
    await writeFile(
      paths.descriptionsVtt,
      toWebVtt(
        cues.map((cue) => ({
          id: cue.id,
          start: cue.start,
          end: cue.delivery === "inline" ? cue.end : cue.start + cue.spokenDurationSec,
          text: cue.delivery === "inline" ? cue.shortText : cue.longText,
          extended: cue.delivery === "extended",
        })),
      ),
    );

    // F9 acceptance, checked on every run.
    const inline = placed.filter((cue) => cue.delivery === "inline");
    const fitting = inline.filter((cue) => inlineCueFitsSpeech(cue, turns)).length;
    const overlaps = findOverlaps(placed);
    const longTooLong = cues.filter((cue) => wordCount(cue.longText) > 25).length;
    if (overlaps.length > 0) throw new Error(`Overlapping cues: ${JSON.stringify(overlaps)}`);

    const meta = await readVideoMeta(videoId);
    await writeVideoMeta({ ...meta, status: "ready_for_review" });
    return {
      summary:
        `${cues.length} cues (${inline.length} inline, ${cues.length - inline.length} extended), ` +
        `timing fit ${fitting}/${inline.length}, 0 overlaps` +
        (longTooLong > 0 ? `, ${longTooLong} long cues over 25 words` : ""),
      costUsd,
    };
  },
};
