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
  parseImageStream,
  recordsOfKind,
  type ImageSegmentationResult,
  type ResponsesEvent,
  type SegmentationMask,
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

// Segments every instance of `concept` in one image.
// Pricing: $2.50 per 1,000 images, so each call costs a quarter of a cent.
export async function segmentImageRaw(
  imagePath: string,
  concept: string,
): Promise<ImageSegmentationResult> {
  const phrase = concept.trim();
  if (!phrase) throw new Error("SAM needs a short, non-empty noun phrase.");

  const bytes = await readFile(imagePath);
  const imageDataUrl = `data:${imageMimeType(imagePath)};base64,${bytes.toString("base64")}`;

  const stream = await metaClient().responses.create({
    model: SAM_MODEL,
    stream: true,
    // Ask for per-object confidence (the "c" field). Metadata values are strings.
    metadata: { include_confidence: "true" },
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: phrase },
          { type: "input_image", image_url: imageDataUrl },
        ],
      },
    ] as never,
  });

  const result = await parseImageStream(withOutputTextDone(stream)).finalResult;

  if (result.outcome.status !== "completed") {
    throw new Error(`SAM segmentation was incomplete: ${result.outcome.reason} ${result.outcome.detail ?? ""}`);
  }
  const parserErrors = result.diagnostics.filter((item) => item.severity === "error");
  if (parserErrors.length > 0) {
    throw new Error(`SAM parser errors: ${parserErrors.map((item) => item.message).join("; ")}`);
  }
  return result;
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
