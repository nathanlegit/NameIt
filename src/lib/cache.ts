// Disk cache for anything expensive (API calls, ffmpeg runs).
// If the JSON file exists, return it; otherwise compute, save, return.
// Re-runs cost nothing and you can open any file to see exactly what a model said.
// Delete the file (or the whole folder) to force a fresh call.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function cachedJson<T>(filePath: string, compute: () => Promise<T>): Promise<T> {
  if (existsSync(filePath)) {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  }
  const value = await compute();
  await writeJson(filePath, value);
  return value;
}

export async function readJson<T>(filePath: string): Promise<T> {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${filePath}. Run the earlier pipeline stage that produces it.`);
  }
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
