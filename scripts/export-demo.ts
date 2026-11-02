// Exports processed videos for the web app: public/demo/<videoId>/
//   video.mp4         720p H.264 copy (never committed: public/demo is gitignored)
//   bundle.json       everything the review UI and player need (src/web/bundle.ts)
//   evidence/*.jpg    the SAM frame and the box overlay per reference
// plus public/demo/index.json (the video list) and public/demo/eval.json (latest eval).
//
// Usage: pnpm export-demo [videoId ...]   (default: every video in the eval test set)
// Re-run after the pipeline or a review changes; the video is only re-encoded if missing.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../src/lib/cache";
import { TEST_SET } from "../src/eval/testSet";
import type { GroundingRecord, MaskFile } from "../src/pipeline/06_ground";
import { frameSize, readVideoMeta, videoPaths } from "../src/pipeline/store";
import type { Cue, LocalisedReference, ReferenceCandidate, Resolution, Turn } from "../src/types";
import { EMPTY_REVIEW, type BundleItem, type ReviewState, type Split, type VideoBundle, type VideoSummary } from "../src/web/bundle";

const DEMO_ROOT = path.join("public", "demo");
const EVAL_JSON = path.join("data", "eval", "latest.json");

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}:\n${stderr.slice(-1000)}`))));
  });
}

// 720p H.264 + AAC with the index at the front (+faststart), so browsers can
// start playing and seeking before the whole file has downloaded.
async function encodeWebVideo(sourcePath: string, outputPath: string): Promise<void> {
  await run("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", sourcePath,
    "-vf", "scale='min(1280,iw)':-2",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    outputPath,
  ]);
}

export async function readReviewState(videoId: string): Promise<ReviewState> {
  const reviewPath = path.join(videoPaths(videoId).dir, "review.json");
  return existsSync(reviewPath) ? readJson<ReviewState>(reviewPath) : EMPTY_REVIEW;
}

async function exportVideo(videoId: string, split: Split): Promise<VideoSummary> {
  const paths = videoPaths(videoId);
  const meta = await readVideoMeta(videoId);
  const turns = await readJson<Turn[]>(paths.transcript);
  const references = await readJson<ReferenceCandidate[]>(paths.references);
  const localisedList = await readJson<LocalisedReference[]>(paths.localised);
  const groundingList = await readJson<GroundingRecord[]>(paths.grounding);
  const resolutions = await readJson<Resolution[]>(paths.resolutions);
  const cues = await readJson<Cue[]>(paths.cues);

  const outputDir = path.join(DEMO_ROOT, videoId);
  const evidenceOut = path.join(outputDir, "evidence");
  await mkdir(evidenceOut, { recursive: true });
  const urlBase = `/demo/${videoId}`;

  const videoOut = path.join(outputDir, "video.mp4");
  if (!existsSync(videoOut)) {
    console.log(`  encoding ${videoId} video...`);
    await encodeWebVideo(meta.sourcePath, videoOut);
  }

  const referenceById = new Map(references.map((reference) => [reference.id, reference]));
  const groundingById = new Map(groundingList.map((record) => [record.referenceId, record]));
  const resolutionById = new Map(resolutions.map((resolution) => [resolution.referenceId, resolution]));
  const cueBySource = new Map(cues.map((cue) => [cue.sourceId, cue]));
  const turnIndexById = new Map(turns.map((turn, index) => [turn.id, index]));

  const items: BundleItem[] = [];
  for (const localised of localisedList) {
    const reference = referenceById.get(localised.referenceId);
    const resolution = resolutionById.get(localised.referenceId);
    const turnIndex = reference ? turnIndexById.get(reference.turnId) : undefined;
    if (!reference || !resolution || turnIndex === undefined) continue;
    const turn = turns[turnIndex]!;
    const grounding = groundingById.get(localised.referenceId);

    let evidence: BundleItem["evidence"] = null;
    if (grounding?.evidence && grounding.candidates[0]) {
      const frameName = `${localised.referenceId}.frame.jpg`;
      const overlayName = `${localised.referenceId}.jpg`;
      await copyFile(grounding.samFramePath, path.join(evidenceOut, frameName));
      await copyFile(grounding.evidence.framePath, path.join(evidenceOut, overlayName));
      const mask = grounding.evidence.maskPath ? await readJson<MaskFile>(grounding.evidence.maskPath) : null;
      evidence = {
        frameUrl: `${urlBase}/evidence/${frameName}`,
        overlayUrl: `${urlBase}/evidence/${overlayName}`,
        box: grounding.candidates[0].box,
        maskPath: mask?.svgPath ?? null,
        maskBounds: mask?.bounds ?? null,
        samScore: grounding.evidence.samScore,
        selectionMargin: grounding.evidence.selectionMargin,
        reasons: grounding.evidence.selectionReasons,
      };
    }

    items.push({
      referenceId: localised.referenceId,
      cueId: `cue-${localised.referenceId}`,
      phrase: reference.phrase,
      kind: reference.kind ?? "object",
      sentence: { start: turn.start, end: turn.end, text: turn.text, phraseOffset: reference.charOffset },
      previousText: turns[turnIndex - 1]?.text ?? null,
      nextText: turns[turnIndex + 1]?.text ?? null,
      estimatedTime: localised.estimatedTime,
      refinedTime: localised.refinedTime,
      evidence,
      rejectedCandidates: (grounding?.candidates ?? []).slice(1, 4).map((candidate) => ({ concept: candidate.concept, box: candidate.box })),
      resolution: {
        resolvedText: resolution.resolvedText,
        specificity: resolution.specificity,
        usedGlossaryEntry: resolution.usedGlossaryEntry,
        confidence: resolution.confidence,
        bucket: resolution.bucket,
        topCandidates: resolution.topCandidates,
        secondAnswer: resolution.secondAnswer,
        uncertaintyNote: resolution.uncertaintyNote,
        confidenceNotes: resolution.confidenceNotes,
      },
      cue: cueBySource.get(localised.referenceId) ?? null,
    });
  }
  items.sort((first, second) => first.estimatedTime - second.estimatedTime);

  const bundle: VideoBundle = {
    id: videoId,
    title: meta.title,
    durationSec: meta.durationSec,
    frameSize: await frameSize(videoId),
    videoUrl: `${urlBase}/video.mp4`,
    split,
    syntheticNarration: split === "scripted",
    licence: meta.licence,
    attribution: meta.attribution,
    turns: turns.map((turn) => ({ start: turn.start, end: turn.end, text: turn.text })),
    items,
    review: await readReviewState(videoId),
  };
  await writeJson(path.join(outputDir, "bundle.json"), bundle);

  const count = (bucket: Resolution["bucket"]) => items.filter((item) => item.resolution.bucket === bucket).length;
  return {
    id: videoId,
    title: meta.title,
    durationSec: meta.durationSec,
    split,
    syntheticNarration: bundle.syntheticNarration,
    attribution: meta.attribution,
    thumbUrl: items.find((item) => item.evidence)?.evidence?.frameUrl ?? null,
    references: items.length,
    ready: count("ready"),
    needsReview: count("needs_review"),
    abstained: count("abstain"),
    cues: items.filter((item) => item.cue).length,
  };
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const videos = requested.length > 0
    ? requested.map((videoId) => ({ videoId, split: TEST_SET.find((entry) => entry.videoId === videoId)?.split ?? ("other" as const) }))
    : TEST_SET;

  // Keep entries for videos not re-exported this time.
  const indexPath = path.join(DEMO_ROOT, "index.json");
  const existing: VideoSummary[] = existsSync(indexPath) ? JSON.parse(await readFile(indexPath, "utf8")) : [];
  const summaries = new Map(existing.map((summary) => [summary.id, summary]));

  for (const { videoId, split } of videos) {
    console.log(`Exporting ${videoId}...`);
    summaries.set(videoId, await exportVideo(videoId, split));
  }

  // Held-out (real narration) first: they are the honest examples.
  const order: Record<Split, number> = { held_out: 0, scripted: 1, other: 2 };
  const index = [...summaries.values()].sort((first, second) => order[first.split] - order[second.split] || first.id.localeCompare(second.id));
  await writeJson(indexPath, index);
  if (existsSync(EVAL_JSON)) await copyFile(EVAL_JSON, path.join(DEMO_ROOT, "eval.json"));
  console.log(`Wrote ${index.length} videos to ${DEMO_ROOT}/`);
}

const isDirectRun = process.argv[1]?.endsWith("export-demo.ts");
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
