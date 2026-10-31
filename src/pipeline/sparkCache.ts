// Disk cache for Muse Spark calls, keyed by the exact request.
//
// The file name is a hash of everything sent: schema, prompts, temperature and
// the images' bytes. Same request -> same file -> no API call. Any change (an
// edited prompt, a re-sampled frame, a corrected transcript) -> new file. So the
// cache can never serve a stale answer, and nobody has to remember to clear it.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { cachedJson } from "../lib/cache";
import { askSparkForJson, type SparkJsonRequest, type SparkJsonResult } from "../meta/spark";

async function requestHash<Schema extends z.ZodType>(request: SparkJsonRequest<Schema>): Promise<string> {
  const hash = createHash("sha256");
  hash.update(JSON.stringify([request.schemaName, request.systemText ?? "", request.userText, request.temperature ?? null]));
  for (const imagePath of request.imagePaths ?? []) {
    hash.update(await readFile(imagePath));
  }
  return hash.digest("hex").slice(0, 16);
}

export async function cachedSpark<Schema extends z.ZodType>(
  cacheDir: string,
  request: SparkJsonRequest<Schema>,
): Promise<SparkJsonResult<z.infer<Schema>>> {
  const key = await requestHash(request);
  const cacheFile = path.join(cacheDir, "spark", `${request.schemaName}-${key}.json`);
  const result = await cachedJson(cacheFile, () => askSparkForJson(request));
  // Cached JSON skips zod; re-validate so a hand-edited or old file fails loudly.
  return { data: request.schema.parse(result.data), usage: result.usage };
}

// Prices from PRD 11.1 (Standard tier).
export function sparkCostUsd(usage: { inputTokens: number; outputTokens: number }): number {
  return (usage.inputTokens * 1.25 + usage.outputTokens * 4.25) / 1_000_000;
}
