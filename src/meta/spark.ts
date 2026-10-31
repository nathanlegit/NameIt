// Adapter for Muse Spark: one structured-JSON call with optional images.
// Verified 30 Oct 2026 against the cookbook notebooks
//   01_api_fundamentals/04_structured_output.ipynb (Chat Completions + response_format json_schema)
//   01_api_fundamentals/07_vision_input.ipynb      (images as image_url data URLs)
// and https://dev.meta.ai/docs/structured-output.
//
// Why Chat Completions and not the Responses API: the cookbook shows images and
// structured output working together on Chat Completions. On the Responses API,
// structured output uses `text.format` instead, and the docs give no full example
// with images. Same model, same price.
//
// Gotcha from the cookbook: images must go in a "user" message. Putting them in a
// "developer" message returns HTTP 400.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { metaClient } from "./client";

export const SPARK_MODEL = "muse-spark-1.3";

export interface SparkJsonRequest<Schema extends z.ZodType> {
  schemaName: string;          // a-z, A-Z, 0-9, _ and - only, max 64 chars
  schema: Schema;
  systemText?: string;         // text-only instructions (shared description rules)
  userText: string;
  imagePaths?: string[];       // JPEG/PNG files sent in order after the text
  temperature?: number;        // 0 to 2
}

export interface SparkJsonResult<T> {
  data: T;
  usage: { inputTokens: number; outputTokens: number };
}

async function imageFileToDataUrl(imagePath: string): Promise<string> {
  const bytes = await readFile(imagePath);
  const extension = path.extname(imagePath).toLowerCase();
  const mimeType = extension === ".png" ? "image/png" : "image/jpeg";
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

// Converts a zod schema to the plain JSON Schema the API expects.
// zod adds a "$schema" key that some servers reject, so we drop it.
function toApiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

export async function askSparkForJson<Schema extends z.ZodType>(
  request: SparkJsonRequest<Schema>,
): Promise<SparkJsonResult<z.infer<Schema>>> {
  const imageParts = await Promise.all(
    (request.imagePaths ?? []).map(async (imagePath) => ({
      type: "image_url" as const,
      image_url: { url: await imageFileToDataUrl(imagePath) },
    })),
  );

  const messages: Array<Record<string, unknown>> = [];
  if (request.systemText) {
    messages.push({ role: "system", content: request.systemText });
  }
  messages.push({
    role: "user",
    content: [{ type: "text", text: request.userText }, ...imageParts],
  });

  // PRD 10.1: on a parse failure, retry once with the error message, then fail loudly.
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const retryNote =
      attempt === 1
        ? []
        : [{ role: "user", content: `Your previous reply was invalid: ${lastError}. Reply again with valid JSON matching the schema.` }];

    const completion = await metaClient().chat.completions.create({
      model: SPARK_MODEL,
      // The SDK's message types don't model every content variant; the shape
      // above is the one shown in the cookbook.
      messages: [...messages, ...retryNote] as never,
      temperature: request.temperature,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: request.schemaName,
          schema: toApiJsonSchema(request.schema),
        },
      },
    });

    const rawText = completion.choices[0]?.message?.content ?? "";
    const usage = {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    };

    try {
      const parsed = request.schema.parse(JSON.parse(rawText));
      return { data: parsed, usage };
    } catch (error) {
      lastError = error instanceof Error ? error.message.slice(0, 400) : String(error);
    }
  }

  throw new Error(`Muse Spark returned invalid JSON for "${request.schemaName}" twice: ${lastError}`);
}
