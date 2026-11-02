// M0 spike: the go/no-go gate.
//
// Runs the whole Name It chain by hand on one clip:
//   ffmpeg -> Muse Voice Transcribe -> find "this"/"that" -> Spark classifies
//   -> Spark picks the best frame -> SAM 3.1 segments -> Spark names the referent
// and writes data/spike/<clip>/spike-report.md for Nathan to mark right or wrong.
// Gate: at least half of 5 to 10 visual references come out right.
//
// Usage:
//   pnpm spike <video> [--keywords "flour,whisk"] [--max 10] [--dry-run]
//
// --dry-run does ingest and stops (no API key needed).
// Every model response is cached under data/spike/<clip>/cache/, so re-running
// is free. Delete a cache file to force a fresh call.

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";

import { loadLocalEnv } from "../src/meta/client";
import { transcribeWav, toTurns } from "../src/meta/transcribe";
import { askSparkForJson } from "../src/meta/spark";
import { segmentImageRaw, toDetections, type ObjectTrack, type SamDetection } from "../src/meta/sam";
import { cachedJson, writeJson } from "../src/lib/cache";
import { probeVideo, extractAudio, sampleFrames, drawBoxesOnImage, type BoxToDraw } from "../src/lib/ffmpeg";
import { findDeicticCandidates, markPhraseInText, type DeicticMatch } from "../src/lib/deixis";
import {
  estimateWordTime,
  windowAroundEstimate,
  frameNumbersInWindow,
  frameNumbersSpanningTurn,
  framePath,
  timeOfFrameNumber,
} from "../src/lib/localise";
import { selectReferent, type FrameSize } from "../src/lib/maskSelection";
import {
  ClassifyReferenceSchema,
  buildClassifyReferencePrompt,
  classifyReferenceSystem,
  type ClassifyReferenceOutput,
} from "../src/prompts/classifyReference";
import {
  LocaliseReferenceSchema,
  buildLocaliseReferencePrompt,
  type LocaliseReferenceOutput,
} from "../src/prompts/localiseReference";
import {
  ResolveReferenceSchema,
  buildResolveReferencePrompt,
  resolveReferenceSystem,
  type ResolveReferenceOutput,
} from "../src/prompts/resolveReference";
import type { ReferenceKind, Turn } from "../src/types";

// Prices from PRD 11.1 (Model API, Standard tier), for the cost line in the report.
const SPARK_DOLLARS_PER_INPUT_TOKEN = 1.25 / 1_000_000;
const SPARK_DOLLARS_PER_OUTPUT_TOKEN = 4.25 / 1_000_000;
const SAM_DOLLARS_PER_IMAGE = 2.5 / 1000;
const TRANSCRIBE_DOLLARS_PER_HOUR = 0.18;

// Stop classifying after this many candidates even if we haven't hit --max.
const MAX_CLASSIFIER_CALLS = 60;

// ---------------------------------------------------------------------------
// Run context: paths and running cost totals
// ---------------------------------------------------------------------------

interface SpikeContext {
  workDir: string;
  framesDir: string;
  cacheDir: string;
  evidenceDir: string;
  totalFrames: number;
  frameSize: FrameSize;
  turns: Turn[];
  sparkInputTokens: number;
  sparkOutputTokens: number;
  samImageCalls: number;
}

interface CachedSpark<T> {
  data: T;
  usage: { inputTokens: number; outputTokens: number };
}

function countSparkUsage(context: SpikeContext, result: CachedSpark<unknown>): void {
  context.sparkInputTokens += result.usage.inputTokens;
  context.sparkOutputTokens += result.usage.outputTokens;
}

// ---------------------------------------------------------------------------
// Step 1: ingest (ffmpeg). Audio for Transcribe, 2 fps frames for Spark and SAM.
// ---------------------------------------------------------------------------

async function ingest(videoPath: string, workDir: string) {
  const meta = await cachedJson(path.join(workDir, "meta.json"), () => probeVideo(videoPath));
  console.log(`Video: ${meta.durationSec.toFixed(1)} s, ${meta.width}x${meta.height}, ${meta.fps} fps, audio: ${meta.hasAudio}`);
  if (!meta.hasAudio) throw new Error("This video has no audio track, so there is no speech to resolve.");
  if (meta.durationSec > 600) throw new Error("Transcribe accepts at most 10 minutes of audio.");

  const wavPath = path.join(workDir, "audio.wav");
  if (!existsSync(wavPath)) {
    console.log("Extracting audio (mono 16 kHz WAV)...");
    await extractAudio(videoPath, wavPath);
  }

  const framesDir = path.join(workDir, "frames");
  let totalFrames = existsSync(framesDir)
    ? (await readdir(framesDir)).filter((name) => name.endsWith(".jpg")).length
    : 0;
  if (totalFrames === 0) {
    console.log("Sampling frames at 2 fps...");
    totalFrames = await sampleFrames(videoPath, framesDir);
  }
  console.log(`Frames: ${totalFrames}`);

  // Boxes from SAM are in the pixels of the image we send it: the sampled frame.
  const firstFrame = await probeVideo(framePath(framesDir, 1));
  const frameSize: FrameSize = { width: firstFrame.width, height: firstFrame.height };

  return { meta, wavPath, framesDir, totalFrames, frameSize };
}

// ---------------------------------------------------------------------------
// Step 2: transcribe (Muse Voice Transcribe, ENDPOINTING mode)
// ---------------------------------------------------------------------------

// ENDPOINTING splits turns at pauses. DIARIZATION only splits on speaker
// changes, so a solo presenter came back as one 17-second turn (see DECISIONS.md).
async function transcribe(wavPath: string, workDir: string, keywords: string[]): Promise<Turn[]> {
  const rawResponse = await cachedJson(path.join(workDir, "cache", "transcribe-endpointing.json"), () => {
    console.log("Transcribing with Muse Voice Transcribe (ENDPOINTING)...");
    return transcribeWav(wavPath, { keywords, mode: "ENDPOINTING" });
  });
  const turns = toTurns(rawResponse);
  await writeJson(path.join(workDir, "transcript.json"), turns);
  console.log(`Transcript: ${turns.length} turns`);
  return turns;
}

// ---------------------------------------------------------------------------
// Step 3: classify each candidate (Spark, F3 stage B)
// ---------------------------------------------------------------------------

function referenceIdFor(match: DeicticMatch): string {
  return `${match.turnId}-c${match.charOffset}`;
}

async function classifyCandidate(
  context: SpikeContext,
  match: DeicticMatch,
  turnIndex: number,
): Promise<ClassifyReferenceOutput> {
  const turn = context.turns[turnIndex]!;
  const frameNumbers = frameNumbersSpanningTurn(turn, 4, context.totalFrames);

  const result = await cachedJson<CachedSpark<ClassifyReferenceOutput>>(
    path.join(context.cacheDir, referenceIdFor(match), "classify.json"),
    () =>
      askSparkForJson({
        schemaName: "classify_reference",
        schema: ClassifyReferenceSchema,
        systemText: classifyReferenceSystem,
        userText: buildClassifyReferencePrompt({
          previousTurnText: context.turns[turnIndex - 1]?.text ?? null,
          markedTurnText: markPhraseInText(turn.text, match),
          nextTurnText: context.turns[turnIndex + 1]?.text ?? null,
          frameTimes: frameNumbers.map(timeOfFrameNumber),
        }),
        imagePaths: frameNumbers.map((frameNumber) => framePath(context.framesDir, frameNumber)),
        temperature: 0,
      }),
  );
  countSparkUsage(context, result);
  return result.data;
}

// ---------------------------------------------------------------------------
// Step 4: localise (proportional estimate, then Spark picks the best frame)
// ---------------------------------------------------------------------------

interface LocaliseStepResult {
  estimatedTime: number;
  refinedTime: number;
  bestFrameNumber: number;
  windowFrameNumbers: number[];
  sparkOutput: LocaliseReferenceOutput;
}

async function localise(
  context: SpikeContext,
  match: DeicticMatch,
  turn: Turn,
  kind: string,
): Promise<LocaliseStepResult> {
  const estimatedTime = estimateWordTime(turn, match.charOffset);
  const window = windowAroundEstimate(turn, estimatedTime);
  const windowFrameNumbers = frameNumbersInWindow(window, context.totalFrames);

  const result = await cachedJson<CachedSpark<LocaliseReferenceOutput>>(
    path.join(context.cacheDir, referenceIdFor(match), "localise.json"),
    () =>
      askSparkForJson({
        schemaName: "localise_reference",
        schema: LocaliseReferenceSchema,
        userText: buildLocaliseReferencePrompt({
          sentence: turn.text,
          phrase: match.phrase,
          kind,
          frameTimes: windowFrameNumbers.map(timeOfFrameNumber),
        }),
        imagePaths: windowFrameNumbers.map((frameNumber) => framePath(context.framesDir, frameNumber)),
        temperature: 0,
      }),
  );
  countSparkUsage(context, result);

  // Guard against an out-of-range index rather than trusting the model blindly.
  const safeIndex = Math.min(Math.max(0, result.data.bestFrameIndex), windowFrameNumbers.length - 1);
  const bestFrameNumber = windowFrameNumbers[safeIndex]!;
  return {
    estimatedTime,
    refinedTime: timeOfFrameNumber(bestFrameNumber),
    bestFrameNumber,
    windowFrameNumbers,
    sparkOutput: result.data,
  };
}

// ---------------------------------------------------------------------------
// Step 5: ground (SAM 3.1 on the best frame, then the selection heuristic)
// ---------------------------------------------------------------------------

interface GroundStepResult {
  conceptsTried: string[];
  detectionCounts: Record<string, number>;
  handCount: number;
  chosen: SamDetection | null;
  chosenReasons: string[];
  selectionMargin: number;
  overlayPath: string;
}

// SAM wants a short noun phrase. Long guesses ("small glass bowl of white powder
// next to the scale") are skipped in favour of the head noun.
function conceptsToTry(localised: LocaliseReferenceOutput): string[] {
  const concepts = [localised.headNoun.trim().toLowerCase()];
  const guess = localised.nounPhraseGuess.trim().toLowerCase();
  if (guess && guess.split(/\s+/).length <= 6 && !concepts.includes(guess)) concepts.push(guess);
  return concepts.filter((concept) => concept.length > 0);
}

async function segmentCached(
  context: SpikeContext,
  referenceId: string,
  imagePath: string,
  concept: string,
): Promise<SamDetection[]> {
  const safeName = concept.replace(/[^a-z0-9]+/gi, "_");
  const cacheFile = path.join(context.cacheDir, referenceId, `sam-${safeName}.json`);
  const alreadyCached = existsSync(cacheFile);
  const detections = await cachedJson(cacheFile, async () =>
    toDetections(await segmentImageRaw(imagePath, concept), concept),
  );
  if (!alreadyCached) context.samImageCalls += 1;
  return detections;
}

// The pipeline's selector works on tracks over time; a still image is a one-frame track.
function detectionsAsTracks(detections: SamDetection[]): ObjectTrack[] {
  return detections.map((detection) => ({
    concept: detection.concept,
    objectId: detection.objectId,
    boxes: [{ frameIndex: 0, box: detection.box, confidence: detection.confidence, mask: detection.mask }],
  }));
}

async function ground(
  context: SpikeContext,
  referenceId: string,
  bestFramePath: string,
  localised: LocaliseReferenceOutput,
  kind: ReferenceKind,
): Promise<GroundStepResult> {
  const concepts = conceptsToTry(localised);
  const detectionCounts: Record<string, number> = {};
  const detectionsByConcept = new Map<string, SamDetection[]>();
  for (const concept of concepts) {
    const detections = await segmentCached(context, referenceId, bestFramePath, concept);
    detectionCounts[concept] = detections.length;
    detectionsByConcept.set(concept, detections);
  }
  const handDetections = await segmentCached(context, referenceId, bestFramePath, "hand");

  // conceptsToTry puts the head noun first and Spark's fuller guess second.
  const [headNounConcept, specificConcept] = concepts;
  const selection = selectReferent({
    specificTracks: specificConcept ? detectionsAsTracks(detectionsByConcept.get(specificConcept) ?? []) : [],
    headNounTracks: detectionsAsTracks(detectionsByConcept.get(headNounConcept!) ?? []),
    handTracks: detectionsAsTracks(handDetections),
    bestFrameIndex: 0,
    frameSize: context.frameSize,
    kind,
  });
  const chosenTrack = selection.chosen;
  const chosen: SamDetection | null = chosenTrack
    ? {
        concept: chosenTrack.track.concept,
        objectId: chosenTrack.track.objectId,
        box: chosenTrack.boxAtBestFrame.box,
        confidence: chosenTrack.boxAtBestFrame.confidence,
        mask: chosenTrack.boxAtBestFrame.mask,
      }
    : null;

  const boxesToDraw: BoxToDraw[] = [
    ...selection.ranked.slice(1).map((other) => ({ box: other.boxAtBestFrame.box, colour: "red", thickness: 2 })),
    ...handDetections.map((hand) => ({ box: hand.box, colour: "yellow", thickness: 3 })),
    ...(chosen ? [{ box: chosen.box, colour: "lime", thickness: 6 }] : []),
  ];
  const overlayPath = path.join(context.evidenceDir, `${referenceId}.jpg`);
  await drawBoxesOnImage(bestFramePath, overlayPath, boxesToDraw);

  return {
    conceptsTried: concepts,
    detectionCounts,
    handCount: handDetections.length,
    chosen,
    chosenReasons: selection.chosen?.reasons ?? [],
    selectionMargin: selection.selectionMargin,
    overlayPath,
  };
}

// ---------------------------------------------------------------------------
// Step 6: resolve (Spark names the referent, with the evidence overlay)
// ---------------------------------------------------------------------------

function transcriptAsText(turns: Turn[]): string {
  return turns.map((turn) => `${turn.start.toFixed(1)}: ${turn.text}`).join("\n");
}

async function resolve(
  context: SpikeContext,
  referenceId: string,
  turn: Turn,
  match: DeicticMatch,
  kind: string,
  bestFramePath: string,
  grounding: GroundStepResult,
): Promise<ResolveReferenceOutput> {
  const hasEvidence = grounding.chosen !== null;
  const result = await cachedJson<CachedSpark<ResolveReferenceOutput>>(
    path.join(context.cacheDir, referenceId, "resolve.json"),
    () =>
      askSparkForJson({
        schemaName: "resolve_reference",
        schema: ResolveReferenceSchema,
        systemText: resolveReferenceSystem,
        userText: buildResolveReferencePrompt({
          transcriptContext: transcriptAsText(context.turns),
          glossary: null,
          sentence: turn.text,
          phrase: match.phrase,
          kind,
          view: hasEvidence ? "frame_and_overlay" : "frame_only",
          sequenceTimes: null,
          selectionReasons: hasEvidence ? grounding.chosenReasons : null,
        }),
        imagePaths: hasEvidence ? [bestFramePath, grounding.overlayPath] : [bestFramePath],
        temperature: 0,
      }),
  );
  countSparkUsage(context, result);
  return result.data;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

interface SpikeRow {
  referenceId: string;
  markedSentence: string;
  phrase: string;
  kind: string;
  classifierReason: string;
  estimatedTime: number;
  refinedTime: number;
  bestFramePath: string;
  nounPhraseGuess: string;
  headNoun: string;
  grounding: Omit<GroundStepResult, "chosen"> & { chosenBox: SamDetection["box"] | null; chosenConfidence: number | null };
  resolution: ResolveReferenceOutput;
}

interface SkippedCandidate {
  referenceId: string;
  markedSentence: string;
  reason: string;
}

interface FailedCandidate {
  referenceId: string;
  markedSentence: string;
  error: string;
}

function relativeToReport(context: SpikeContext, filePath: string): string {
  return path.relative(context.workDir, filePath).split(path.sep).join("/");
}

function estimateCostDollars(context: SpikeContext, audioSeconds: number): number {
  return (
    context.sparkInputTokens * SPARK_DOLLARS_PER_INPUT_TOKEN +
    context.sparkOutputTokens * SPARK_DOLLARS_PER_OUTPUT_TOKEN +
    context.samImageCalls * SAM_DOLLARS_PER_IMAGE +
    (audioSeconds / 3600) * TRANSCRIBE_DOLLARS_PER_HOUR
  );
}

function buildReport(
  context: SpikeContext,
  clipName: string,
  rows: SpikeRow[],
  skipped: SkippedCandidate[],
  failed: FailedCandidate[],
  costDollars: number,
): string {
  const lines: string[] = [];
  lines.push(`# M0 spike report: ${clipName}`, "");
  lines.push(`Generated ${new Date().toISOString()}. Visual references: ${rows.length}. Non-visual: ${skipped.length}. Errors: ${failed.length}.`);
  lines.push(`Estimated API cost of these results: $${costDollars.toFixed(3)}.`, "");
  lines.push("## How to judge", "");
  lines.push("Fill in the **Correct?** column with y or n: is the resolved text what the presenter actually meant?");
  lines.push("**Gate:** at least half correct means go. Fewer means stop and rethink before M1.", "");
  lines.push("| # | Time | Sentence | Kind | SAM | Resolved | Conf | Correct? |");
  lines.push("|---|---|---|---|---|---|---|---|");
  rows.forEach((row, index) => {
    const samSummary = row.grounding.chosenBox
      ? `found (${row.grounding.conceptsTried.join(" / ")})`
      : "nothing found";
    lines.push(
      `| ${index + 1} | ${row.refinedTime.toFixed(1)} s | ${row.markedSentence.replace(/\|/g, "/")} | ${row.kind} | ${samSummary} | ${row.resolution.resolvedText ?? "(abstained)"} | ${row.resolution.confidence.toFixed(2)} |  |`,
    );
  });
  lines.push("");

  lines.push("## Details", "");
  rows.forEach((row, index) => {
    lines.push(`### ${index + 1}. "${row.phrase}" at ${row.refinedTime.toFixed(1)} s (${row.referenceId})`, "");
    lines.push(`> ${row.markedSentence}`, "");
    lines.push(`- **Classifier:** ${row.kind}. ${row.classifierReason}`);
    lines.push(`- **Time:** estimated ${row.estimatedTime.toFixed(1)} s, refined to ${row.refinedTime.toFixed(1)} s (moved ${(row.refinedTime - row.estimatedTime).toFixed(1)} s)`);
    lines.push(`- **Spark's guess:** "${row.nounPhraseGuess}" (SAM concept: "${row.headNoun}")`);
    lines.push(`- **SAM detections:** ${Object.entries(row.grounding.detectionCounts).map(([concept, count]) => `${concept}: ${count}`).join(", ")}; hands: ${row.grounding.handCount}`);
    lines.push(`- **Why this region:** ${row.grounding.chosenReasons.join("; ") || "(none selected)"}. Margin over runner-up: ${row.grounding.selectionMargin.toFixed(2)}`);
    lines.push(`- **Resolved:** ${row.resolution.resolvedText ?? "(abstained)"} (${row.resolution.specificity}, confidence ${row.resolution.confidence.toFixed(2)})`);
    if (row.resolution.uncertaintyNote) lines.push(`- **Uncertainty:** ${row.resolution.uncertaintyNote}`);
    lines.push("");
    lines.push(`Evidence (green = selected, yellow = hands, red = other candidates):`, "");
    lines.push(`![evidence](${relativeToReport(context, row.grounding.overlayPath)})`, "");
  });

  if (skipped.length > 0) {
    lines.push("## Classified as not visual", "");
    lines.push("Check these too: a real visual reference in this list is a classifier miss (recall matters most).", "");
    for (const candidate of skipped) lines.push(`- ${candidate.markedSentence}: ${candidate.reason}`);
    lines.push("");
  }
  if (failed.length > 0) {
    lines.push("## Errors", "");
    for (const candidate of failed) lines.push(`- ${candidate.markedSentence}: \`${candidate.error}\``);
    lines.push("");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      keywords: { type: "string", default: "" },
      max: { type: "string", default: "10" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const videoPath = positionals[0];
  if (!videoPath || !existsSync(videoPath)) {
    throw new Error('Usage: pnpm spike <video> [--keywords "flour,whisk"] [--max 10] [--dry-run]');
  }
  const maxVisualReferences = Number(values.max);
  const keywords = values.keywords.split(",").map((word) => word.trim()).filter(Boolean);

  loadLocalEnv();

  const clipName = path.basename(videoPath, path.extname(videoPath));
  const workDir = path.join("data", "spike", clipName);
  const startedAt = Date.now();

  const ingested = await ingest(videoPath, workDir);
  if (values["dry-run"]) {
    console.log(`Dry run done. Outputs in ${workDir}/`);
    return;
  }

  const turns = await transcribe(ingested.wavPath, workDir, keywords);
  const context: SpikeContext = {
    workDir,
    framesDir: ingested.framesDir,
    cacheDir: path.join(workDir, "cache"),
    evidenceDir: path.join(workDir, "evidence"),
    totalFrames: ingested.totalFrames,
    frameSize: ingested.frameSize,
    turns,
    sparkInputTokens: 0,
    sparkOutputTokens: 0,
    samImageCalls: 0,
  };

  const allCandidates = turns.flatMap((turn, turnIndex) =>
    findDeicticCandidates(turn).map((match) => ({ match, turn, turnIndex })),
  );
  console.log(`Deictic candidates: ${allCandidates.length}`);

  const rows: SpikeRow[] = [];
  const skipped: SkippedCandidate[] = [];
  const failed: FailedCandidate[] = [];
  let classifierCalls = 0;

  for (const { match, turn, turnIndex } of allCandidates) {
    if (rows.length >= maxVisualReferences || classifierCalls >= MAX_CLASSIFIER_CALLS) break;
    const referenceId = referenceIdFor(match);
    const markedSentence = markPhraseInText(turn.text, match);

    // One failure (a timeout, a bad response) shouldn't sink the whole spike.
    try {
      classifierCalls += 1;
      const classification = await classifyCandidate(context, match, turnIndex);
      if (!classification.isVisualReference || classification.referenceKind === null) {
        skipped.push({ referenceId, markedSentence, reason: classification.reason });
        console.log(`  - not visual: ${markedSentence}`);
        continue;
      }
      const kind = classification.referenceKind;
      console.log(`  + visual (${kind}): ${markedSentence}`);

      const localised = await localise(context, match, turn, kind);
      const bestFramePath = framePath(context.framesDir, localised.bestFrameNumber);
      const grounding = await ground(context, referenceId, bestFramePath, localised.sparkOutput, kind);
      const resolution = await resolve(context, referenceId, turn, match, kind, bestFramePath, grounding);
      console.log(`      -> ${resolution.resolvedText ?? "(abstained)"} [${resolution.confidence.toFixed(2)}]`);

      const { chosen, ...groundingWithoutDetection } = grounding;
      rows.push({
        referenceId,
        markedSentence,
        phrase: match.phrase,
        kind,
        classifierReason: classification.reason,
        estimatedTime: localised.estimatedTime,
        refinedTime: localised.refinedTime,
        bestFramePath,
        nounPhraseGuess: localised.sparkOutput.nounPhraseGuess,
        headNoun: localised.sparkOutput.headNoun,
        grounding: {
          ...groundingWithoutDetection,
          chosenBox: chosen?.box ?? null,
          chosenConfidence: chosen?.confidence ?? null,
        },
        resolution,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ referenceId, markedSentence, error: message.slice(0, 300) });
      console.error(`  ! error on ${referenceId}: ${message}`);
    }
  }

  const costDollars = estimateCostDollars(context, ingested.meta.durationSec);
  await writeJson(path.join(workDir, "spike-results.json"), { rows, skipped, failed, costDollars });
  const reportPath = path.join(workDir, "spike-report.md");
  await writeFile(reportPath, buildReport(context, clipName, rows, skipped, failed, costDollars));

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsedSec} s. ${rows.length} visual references, ${skipped.length} non-visual, ${failed.length} errors.`);
  console.log(`Estimated cost: $${costDollars.toFixed(3)}`);
  console.log(`Open the report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
