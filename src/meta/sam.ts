// Adapter for SAM 3.1 (open-vocabulary segmentation).
// Verified 30 Oct 2026 against:
//   https://dev.meta.ai/docs/sam/segmenting
//   https://dev.meta.ai/docs/sam/reading-segmentation
//   https://dev.meta.ai/docs/sam/client-libraries
//   cookbook 07_sam/01_api_basics/typescript/sam-api.ts
//
// How SAM is called: the Responses API (POST /v1/responses) with model "sam-3.1",
// one user message holding a short noun phrase plus an image or video.
// One concept per request: to find "bowl" and "hand", send two requests.
//
// How SAM answers: NOT JSON. It streams a compact text grammar with base85 masks.
// Meta's @meta-sam/parser package turns that stream into typed records, so we
// never parse the grammar ourselves.

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  formats,
  parseImageStream,
  parseVideoStream,
  recordsOfKind,
  type ImageSegmentationResult,
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

// One object SAM found for one concept in one image.
export interface SamDetection {
  concept: string;          // the noun phrase we asked for, e.g. "bowl"
  objectId: string;         // stable per object; not dense or 0-based
  box: PixelBox;            // corners, in source-image pixels
  confidence: number | null; // 0 to 1; null if the API omitted it
  mask: SegmentationMask | null; // decode with decodeMaskToRaster when needed
}

// TODO-VERIFY: the cookbook says the API streams `response.content_part.done`
// but not `response.output_text.done`, which the parser needs to finish a text
// lane. This shim synthesises the missing event (copied in spirit from the
// cookbook's normalizedEvents). Check whether parser 0.1.0 still needs it; if
// SAM results come back empty or "incomplete", this is the first suspect.
async function* withOutputTextDone(stream: AsyncIterable<unknown>): AsyncIterable<ResponsesEvent> {
  const finishedLanes = new Set<string>();
  for await (const raw of stream) {
    const event = raw as {
      type?: string;
      item_id?: unknown;
      output_index?: unknown;
      content_index?: unknown;
      part?: { type?: unknown; text?: unknown } | null;
    };
    const laneKey = `${String(event.item_id)}:${String(event.output_index)}:${String(event.content_index)}`;

    if (event.type === "response.output_text.done") {
      if (!finishedLanes.has(laneKey)) {
        finishedLanes.add(laneKey);
        yield event as unknown as ResponsesEvent;
      }
      continue;
    }

    yield event as unknown as ResponsesEvent;

    const isFinishedTextPart =
      event.type === "response.content_part.done" &&
      event.part?.type === "output_text" &&
      typeof event.part.text === "string";
    if (isFinishedTextPart && !finishedLanes.has(laneKey)) {
      finishedLanes.add(laneKey);
      yield {
        type: "response.output_text.done",
        item_id: event.item_id,
        output_index: event.output_index,
        content_index: event.content_index,
        text: event.part!.text,
      } as unknown as ResponsesEvent;
    }
  }
}

function imageMimeType(imagePath: string): string {
  const extension = path.extname(imagePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
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

// Segments every instance of `concept` in one image.
// Pricing: $2.50 per 1,000 images, so each call costs a quarter of a cent.
export async function segmentImageRaw(
  imagePath: string,
  concept: string,
): Promise<ImageSegmentationResult> {
  const bytes = await readFile(imagePath);
  const imageDataUrl = `data:${imageMimeType(imagePath)};base64,${bytes.toString("base64")}`;
  const stream = await startSamStream(concept, { type: "input_image", image_url: imageDataUrl });
  const result = await parseImageStream(withOutputTextDone(stream)).finalResult;
  assertCompleteResult(result);
  return result;
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
  const result = await parseVideoStream(withOutputTextDone(stream)).finalResult;
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

// One object followed through the clip. An image is a one-frame clip.
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

// Pairs each object's box record with its mask record (they share objectId).
export function toDetections(result: ImageSegmentationResult, concept: string): SamDetection[] {
  const maskByObjectId = new Map<string, SegmentationMask>();
  for (const maskRecord of recordsOfKind(result.records, "mask")) {
    maskByObjectId.set(maskRecord.objectId, maskRecord.mask);
  }

  return recordsOfKind(result.records, "box").map((boxRecord) => ({
    concept,
    objectId: boxRecord.objectId,
    box: {
      left: boxRecord.left,
      top: boxRecord.top,
      right: boxRecord.right,
      bottom: boxRecord.bottom,
    },
    confidence: boxRecord.confidence ?? null,
    mask: maskByObjectId.get(boxRecord.objectId) ?? null,
  }));
}
