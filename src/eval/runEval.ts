// pnpm eval: measures Name It against the hand labels (PRD 13).
//
// For every video in TEST_SET:
//   1. match the pipeline's references to the labels (detection recall/precision)
//   2. for each detected visual reference, judge Name It's resolution, and run
//      and judge the no-grounding baseline (PRD 13.3) on the same reference
//   3. check cue timing (inline cues end before the next turn; no overlaps)
// Then write data/eval/latest.json and docs/EVAL.md, and print the summary.
//
// All Spark calls (baseline and judge) are cached per video, so re-running
// the eval is free unless something changed.

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../lib/cache";
import { mapWithConcurrency } from "../lib/concurrency";
import { bucketFor } from "../lib/confidence";
import { framePath, frameNumbersInWindow, timeOfFrameNumber, windowAroundEstimate } from "../lib/localise";
import { findOverlaps, inlineCueFitsSpeech, type PlacedCue } from "../lib/placement";
import { loadLocalEnv } from "../meta/client";
import { cachedSpark, sparkCostUsd } from "../pipeline/sparkCache";
import { countFrames, readVideoMeta, videoPaths } from "../pipeline/store";
import { BaselineResolveSchema, baselineResolveSystem, buildBaselineResolvePrompt } from "../prompts/baselineResolve";
import { buildJudgeResolutionPrompt, JudgeResolutionSchema } from "../prompts/judgeResolution";
import type { Cue, EvalReferenceLabel, LocalisedReference, ReferenceCandidate, Resolution, Turn } from "../types";
import { matchLabels, type TimedPrediction } from "./match";
import { computeSplitMetrics, percent, type EvalItem, type SplitMetrics, type SystemAnswer, type VideoTiming } from "./metrics";
import { TEST_SET, type Split } from "./testSet";

const EVAL_CONCURRENCY = 8;
const LATEST_JSON = path.join("data", "eval", "latest.json");
const EVAL_MD = path.join("docs", "EVAL.md");
const OVERRIDES_JSON = path.join("src", "eval", "overrides.json");

// Nathan's spot-check corrections to the judge, e.g.
// [{ "videoId": "clip1", "labelTime": 38.4, "phrase": "that", "system": "nameIt", "correct": true, "note": "..." }]
interface JudgeOverride {
  videoId: string;
  labelTime: number;
  phrase: string;
  system: "nameIt" | "baseline";
  correct: boolean;
  note: string;
}

let totalCostUsd = 0;

async function judge(cacheDir: string, label: EvalReferenceLabel, sentence: string, prediction: string) {
  const result = await cachedSpark(cacheDir, {
    schemaName: "judge_resolution",
    schema: JudgeResolutionSchema,
    userText: buildJudgeResolutionPrompt({
      sentence,
      phrase: label.phrase,
      trueReferent: label.trueReferent,
      acceptableAlternatives: label.acceptableAlternatives,
      prediction,
    }),
    temperature: 0,
  });
  totalCostUsd += sparkCostUsd(result.usage);
  return result.data;
}

async function evaluateVideo(videoId: string, split: Split, overrides: JudgeOverride[]) {
  const paths = videoPaths(videoId);
  const meta = await readVideoMeta(videoId);
  const labels = await readJson<EvalReferenceLabel[]>(path.join("src", "eval", "labels", `${videoId}.json`));
  const turns = await readJson<Turn[]>(paths.transcript);
  const references = await readJson<ReferenceCandidate[]>(paths.references);
  const localisedList = await readJson<LocalisedReference[]>(paths.localised);
  const resolutions = await readJson<Resolution[]>(paths.resolutions);
  const cues = await readJson<Cue[]>(paths.cues);
  const totalFrames = await countFrames(videoId);

  const turnById = new Map(turns.map((turn) => [turn.id, turn]));
  const localisedById = new Map(localisedList.map((localised) => [localised.referenceId, localised]));
  const resolutionById = new Map(resolutions.map((resolution) => [resolution.referenceId, resolution]));

  // 1. Match every candidate (visual or not), so a decoy can be "correctly rejected".
  const predictions: TimedPrediction[] = references.map((reference) => ({
    reference,
    time: turnById.get(reference.turnId)?.start ?? 0,
  }));
  const { matches, unlabelled } = matchLabels(labels, predictions);

  const overrideFor = (label: EvalReferenceLabel, system: JudgeOverride["system"]) =>
    overrides.find(
      (override) =>
        override.videoId === videoId &&
        override.system === system &&
        override.phrase.toLowerCase() === label.phrase.toLowerCase() &&
        Math.abs(override.labelTime - label.time) < 0.05,
    );

  // 2. Judge Name It, run and judge the baseline.
  const items = await mapWithConcurrency(matches, EVAL_CONCURRENCY, async ({ label, prediction }) => {
    const reference = prediction?.reference ?? null;
    const detected = reference?.isVisualReference ?? false;
    const item: EvalItem = {
      videoId,
      split,
      labelTime: label.time,
      phrase: label.phrase,
      isVisual: label.isVisual,
      trueReferent: label.trueReferent,
      referenceId: reference?.id ?? null,
      detected,
      nameIt: null,
      baseline: null,
    };
    if (!label.isVisual || !detected || !reference) return item;

    const sentence = turnById.get(reference.turnId)?.text ?? "";
    const localised = localisedById.get(reference.id);
    const resolution = resolutionById.get(reference.id);
    if (!localised || !resolution) throw new Error(`${videoId}: reference ${reference.id} has no localisation or resolution.`);

    const judged = async (text: string | null, system: JudgeOverride["system"]) => {
      if (text === null) return { correct: null, judgeReason: null };
      const override = overrideFor(label, system);
      if (override) return { correct: override.correct, judgeReason: `override: ${override.note}` };
      const verdict = await judge(paths.cacheDir, label, sentence, text);
      return { correct: verdict.verdict === "correct", judgeReason: verdict.reason };
    };

    // Name It: the resolution as the pipeline left it.
    const nameItText = resolution.bucket === "abstain" ? null : resolution.resolvedText;
    const nameIt: SystemAnswer = {
      text: nameItText,
      confidence: resolution.confidence,
      bucket: resolution.bucket,
      ...(await judged(nameItText, "nameIt")),
    };

    // Baseline: the same frames Stage 05 looked at, the sentence, one call.
    const frameNumbers = frameNumbersInWindow(
      windowAroundEstimate({ start: 0, end: meta.durationSec }, localised.estimatedTime),
      totalFrames,
    );
    const baselineResult = await cachedSpark(paths.cacheDir, {
      schemaName: "baseline_resolve",
      schema: BaselineResolveSchema,
      systemText: baselineResolveSystem,
      userText: buildBaselineResolvePrompt({
        sentence,
        phrase: reference.phrase,
        kind: reference.kind ?? "object",
        frameTimes: frameNumbers.map(timeOfFrameNumber),
      }),
      imagePaths: frameNumbers.map((frameNumber) => framePath(paths.framesDir, frameNumber)),
      temperature: 0,
    });
    totalCostUsd += sparkCostUsd(baselineResult.usage);
    const baselineBucket = baselineResult.data.resolvedText === null ? "abstain" : bucketFor(baselineResult.data.confidence);
    const baselineText = baselineBucket === "abstain" ? null : baselineResult.data.resolvedText;
    const baseline: SystemAnswer = {
      text: baselineText,
      confidence: baselineResult.data.confidence,
      bucket: baselineBucket,
      ...(await judged(baselineText, "baseline")),
    };

    return { ...item, nameIt, baseline };
  });

  // 3. Cue timing, over every cue in the video.
  const placed: PlacedCue[] = cues.map((cue) => ({
    id: cue.id,
    delivery: cue.delivery,
    start: cue.start,
    end: cue.end,
    text: cue.delivery === "inline" ? cue.shortText : cue.longText,
    spokenDurationSec: cue.spokenDurationSec,
    gap: null,
    reason: cue.placementReason,
  }));
  const inline = placed.filter((cue) => cue.delivery === "inline");
  const timing: VideoTiming = {
    videoId,
    split,
    durationSec: meta.durationSec,
    cues: placed.length,
    inlineCues: inline.length,
    inlineFitting: inline.filter((cue) => inlineCueFitsSpeech(cue, turns)).length,
    overlaps: findOverlaps(placed).length,
    unlabelledPredictions: unlabelled.filter((item) => item.reference.isVisualReference).length,
  };

  const unlabelledVisual = unlabelled
    .filter((item) => item.reference.isVisualReference)
    .map((item) => ({
      videoId,
      time: item.time,
      phrase: item.reference.phrase,
      sentence: turnById.get(item.reference.turnId)?.text ?? "",
      resolvedText: resolutionById.get(item.reference.id)?.resolvedText ?? null,
    }));
  return { items, timing, unlabelledVisual };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function perMinute(value: number | null): string {
  return value === null ? "–" : value.toFixed(1);
}

function metricRows(metrics: SplitMetrics): string[][] {
  const { nameIt, baseline } = metrics;
  return [
    ["Detection recall", "≥ 80%", `${percent(metrics.detectionRecall)} (${metrics.detected}/${metrics.visualLabels})`, "same detector"],
    ["Detection precision", "≥ 75%", `${percent(metrics.detectionPrecision)} (${metrics.falsePositives} false alarms on ${metrics.decoyLabels} decoys)`, "same detector"],
    ["Resolution accuracy", "≥ 70%", `${percent(nameIt.resolutionAccuracy)} (${nameIt.correct}/${nameIt.answered})`, `${percent(baseline.resolutionAccuracy)} (${baseline.correct}/${baseline.answered})`],
    ["Abstention rate", "10 to 25%", percent(nameIt.abstentionRate), percent(baseline.abstentionRate)],
    ["Hallucination rate (ready and wrong)", "≤ 10%", percent(nameIt.hallucinationRate), percent(baseline.hallucinationRate)],
    ["`ready` precision", "≥ 85%", `${percent(nameIt.readyPrecision)} (of ${nameIt.ready})`, `${percent(baseline.readyPrecision)} (of ${baseline.ready})`],
    ["Unresolved visual references per minute", "lower", `${perMinute(metrics.unresolvedPerMinuteBefore)} → ${perMinute(nameIt.unresolvedPerMinute)}`, `${perMinute(metrics.unresolvedPerMinuteBefore)} → ${perMinute(baseline.unresolvedPerMinute)}`],
    ["Cue timing fit (inline cues)", "100%", `${percent(metrics.cueTimingFit)} (${metrics.inlineCues} inline of ${metrics.cues} cues, ${metrics.overlaps} overlaps)`, "n/a"],
  ];
}

function markdownTable(header: string[], rows: string[][]): string {
  const escape = (cell: string) => cell.replace(/\|/g, "/").replace(/\n/g, " ");
  return [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ].join("\n");
}

function answerCell(answer: SystemAnswer | null): string {
  if (!answer) return "–";
  if (answer.bucket === "abstain") return `(abstained, ${answer.confidence.toFixed(2)})`;
  const verdict = answer.correct === true ? "✅" : answer.correct === false ? "❌" : "?";
  return `${verdict} ${answer.text} *(${answer.bucket}, ${answer.confidence.toFixed(2)})*`;
}

function buildMarkdown(
  generatedAt: string,
  metricsBySplit: SplitMetrics[],
  items: EvalItem[],
  unlabelled: Array<{ videoId: string; time: number; phrase: string; sentence: string; resolvedText: string | null }>,
): string {
  const lines: string[] = [];
  lines.push("# Name It evaluation", "");
  lines.push(`Generated ${generatedAt} by \`pnpm eval\`. Method: PRD Section 13. Raw data: \`data/eval/latest.json\`.`, "");
  lines.push(
    "- **Scripted** clips use stock footage with our own narration and were used for tuning, so they flatter the system. **Held-out** clips have real narration and were never used for tuning: those are the honest numbers.",
    "- **Baseline:** Spark sees the same frames and the sentence, and names the referent in one call: no SAM, no glossary, no transcript, no second answer. It uses Name It's detector, so detection numbers are shared.",
    "- **Judge:** Spark compares each answer with the human label (text only). Verdicts can be overridden in `src/eval/overrides.json` after a human check.",
    "",
  );

  for (const metrics of metricsBySplit) {
    const title = metrics.split === "all" ? "All clips" : metrics.split === "scripted" ? "Scripted clips (tuning set)" : "Held-out clips (real narration)";
    lines.push(`## ${title}`, "");
    if (metrics.videos === 0) {
      lines.push("No clips in this split yet.", "");
      continue;
    }
    lines.push(`${metrics.videos} clips, ${metrics.minutes.toFixed(1)} minutes, ${metrics.visualLabels} visual references, ${metrics.decoyLabels} decoys.`, "");
    lines.push(markdownTable(["Metric", "Target", "Name It", "Baseline"], metricRows(metrics)), "");
  }

  lines.push("## Every labelled reference", "");
  lines.push(
    markdownTable(
      ["Clip", "Time", "Phrase", "Label", "Name It", "Baseline"],
      items.map((item) => [
        item.videoId,
        `${item.labelTime.toFixed(1)} s`,
        `"${item.phrase}"`,
        item.isVisual ? item.trueReferent : "*(decoy: not visual)*",
        item.isVisual ? (item.detected ? answerCell(item.nameIt) : "❌ missed") : item.detected ? "❌ flagged as visual" : "✅ rejected",
        item.isVisual && item.detected ? answerCell(item.baseline) : "",
      ]),
    ),
    "",
  );

  if (unlabelled.length > 0) {
    lines.push("## Visual references found that have no label", "");
    lines.push("Not counted in any metric. Each needs a label (visual or decoy) from a human.", "");
    lines.push(
      markdownTable(
        ["Clip", "Time", "Phrase", "Sentence", "Name It said"],
        unlabelled.map((item) => [item.videoId, `${item.time.toFixed(1)} s`, `"${item.phrase}"`, item.sentence, item.resolvedText ?? "(abstained)"]),
      ),
      "",
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  loadLocalEnv();
  const overrides: JudgeOverride[] = existsSync(OVERRIDES_JSON) ? JSON.parse(await readFile(OVERRIDES_JSON, "utf8")) : [];

  const results = [];
  for (const { videoId, split } of TEST_SET) {
    console.log(`Evaluating ${videoId} (${split})...`);
    results.push(await evaluateVideo(videoId, split, overrides));
  }

  const items = results.flatMap((result) => result.items);
  const timings = results.map((result) => result.timing);
  const unlabelled = results.flatMap((result) => result.unlabelledVisual);
  const splits: Array<Split | "all"> = ["held_out", "scripted", "all"];
  const metricsBySplit = splits.map((split) =>
    split === "all"
      ? computeSplitMetrics("all", items, timings)
      : computeSplitMetrics(split, items.filter((item) => item.split === split), timings.filter((timing) => timing.split === split)),
  );

  const generatedAt = new Date().toISOString();
  await mkdir(path.dirname(LATEST_JSON), { recursive: true });
  await writeJson(LATEST_JSON, { generatedAt, metrics: metricsBySplit, items, timings, unlabelled });
  await writeFile(EVAL_MD, `${buildMarkdown(generatedAt, metricsBySplit, items, unlabelled)}\n`);

  for (const metrics of metricsBySplit.filter((entry) => entry.videos > 0)) {
    console.log(`\n${metrics.split}: ${metrics.videos} clips, ${metrics.visualLabels} visual references, ${metrics.decoyLabels} decoys`);
    console.table(
      Object.fromEntries(metricRows(metrics).map(([name, target, nameIt, baseline]) => [name, { target, "Name It": nameIt, baseline }])),
    );
  }
  // Cached calls carry the usage of their original request, so this is the
  // list-price cost of all baseline and judge calls, not what this run billed.
  console.log(`\nWrote ${EVAL_MD} and ${LATEST_JSON}. Baseline + judge calls priced at list rate: $${totalCostUsd.toFixed(4)} (calls served from cache are not billed again).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
