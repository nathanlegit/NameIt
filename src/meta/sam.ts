// Adapter for SAM 3.1 (open-vocabulary segmentation).
// Verified 30 Oct 2026 against:
//   https://dev.meta.ai/docs/sam/segmenting
//   https://dev.meta.ai/docs/sam/reading-segmentation
//   https://dev.meta.ai/docs/sam/client-libraries
//   cookbook 07_sam/01_api_basics/typescript/sam-api.ts
//
// How SAM is called: the Responses API (POST /v1/responses) with model "sam-3.1",
// one user message holding a short noun phrase plus a video clip. (SAM also takes
// images; the M0 spike used that, the pipeline tracks through video instead.)
// One concept per request: to find "bowl" and "hand", send two requests.
//
// How SAM answers: NOT JSON. It streams a compact text grammar with base85 masks.
// Meta's @meta-sam/parser package turns that stream into typed records, so we
// never parse the grammar ourselves.

import { readFile } from "node:fs/promises";
import {
  formats,
  parseVideoStream,
  recordsOfKind,
  type ResponsesEvent,
  type SegmentationMask,
  type SegmentationResult,
  type VideoSegmentationResult,
} from "@meta-sam/parser";
import { metaClient } from "./client";

const SAM_MODEL = "sam-3.1";

export interface PixelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Opens a streaming SAM request: one concept phrase plus one media part.
async function startSamStream(concept: string, mediaPart: Record<string, unknown>) {
  const phrase = concept.trim();
  if (!phrase) throw new Error("SAM needs a short, non-empty noun phrase.");
  return metaClient().responses.create({
    model: SAM_MODEL,
    stream: true,
    // Ask for per-object confidence (the "c" field). Metadata values are strings.
    metadata: { include_confidence: "true" },
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: phrase }, mediaPart],
      },
    ] as never,
  });
}

function assertCompleteResult(result: SegmentationResult): void {
  if (result.outcome.status !== "completed") {
    throw new Error(`SAM segmentation was incomplete: ${result.outcome.reason} ${result.outcome.detail ?? ""}`);
  }
  const parserErrors = result.diagnostics.filter((item) => item.severity === "error");
  if (parserErrors.length > 0) {
    throw new Error(`SAM parser errors: ${parserErrors.map((item) => item.message).join("; ")}`);
  }
}

// Segments and TRACKS every instance of `concept` through a short video clip.
// Each object keeps the same objectId across frames, which is what lets us
// measure motion and hand contact over time. The clip is sent inline as a
// base64 data URL (allowed by the docs), so no Files API upload is needed.
// Pricing: $0.20 per 1,000 frames, minimum 50 frames per request.
export async function segmentVideoRaw(
  videoPath: string,
  concept: string,
): Promise<VideoSegmentationResult> {
  const bytes = await readFile(videoPath);
  const videoDataUrl = `data:video/mp4;base64,${bytes.toString("base64")}`;
  const stream = await startSamStream(concept, { type: "input_video", video_url: videoDataUrl });
  // The stream now ends each text lane with response.output_text.done, so the
  // parser needs no shim (verified 3 Nov; the cookbook's shim is no longer needed).
  const result = await parseVideoStream(stream as AsyncIterable<ResponsesEvent>).finalResult;
  assertCompleteResult(result);
  return result;
}

// Re-parses SAM's raw output text (result.rawOutput) without calling the API.
// We cache the raw text rather than parsed objects, so the cache holds exactly
// what SAM returned and any cache file can double as a test fixture.
export function parseVideoRawOutput(rawOutput: string): VideoSegmentationResult {
  const parser = formats.segmentation.video().createParser();
  parser.push(rawOutput, { emit: false });
  return parser.finish({ status: "completed" }).result;
}

// One box (and mask) for one object in one frame.
export interface TrackedBox {
  frameIndex: number;
  box: PixelBox;
  confidence: number | null;
  mask: SegmentationMask | null;
}

// One object followed through the clip.
export interface ObjectTrack {
  concept: string;   // the phrase SAM was given
  objectId: string;  // stable across frames within one SAM response
  boxes: TrackedBox[]; // sorted by frameIndex; frames where the object is hidden are absent
}

// Groups SAM's per-frame records into one track per object.
export function toTracks(result: SegmentationResult, concept: string): ObjectTrack[] {
  const maskByKey = new Map<string, SegmentationMask>();
  for (const maskRecord of recordsOfKind(result.records, "mask")) {
    maskByKey.set(`${maskRecord.objectId}@${maskRecord.frame?.frameIndex ?? 0}`, maskRecord.mask);
  }

  const boxesByObject = new Map<string, TrackedBox[]>();
  for (const boxRecord of recordsOfKind(result.records, "box")) {
    const frameIndex = boxRecord.frame?.frameIndex ?? 0;
    const trackedBox: TrackedBox = {
      frameIndex,
      box: { left: boxRecord.left, top: boxRecord.top, right: boxRecord.right, bottom: boxRecord.bottom },
      confidence: boxRecord.confidence ?? null,
      mask: maskByKey.get(`${boxRecord.objectId}@${frameIndex}`) ?? null,
    };
    const existing = boxesByObject.get(boxRecord.objectId) ?? [];
    existing.push(trackedBox);
    boxesByObject.set(boxRecord.objectId, existing);
  }

  return [...boxesByObject.entries()].map(([objectId, boxes]) => ({
    concept,
    objectId,
    // Frames can arrive out of order (forward pass, then backward), so sort.
    boxes: boxes.sort((first, second) => first.frameIndex - second.frameIndex),
  }));
}
