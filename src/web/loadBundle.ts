// Server-side reads of the exported demo data (public/demo, see scripts/export-demo.ts).
// Pages are built from these at build time, so the deployed site needs no database.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isValidVideoId } from "../lib/videoId";
import type { VideoBundle, VideoSummary } from "./bundle";

const DEMO_ROOT = path.join(process.cwd(), "public", "demo");

export async function loadIndex(): Promise<VideoSummary[]> {
  const indexPath = path.join(DEMO_ROOT, "index.json");
  if (!existsSync(indexPath)) return [];
  return JSON.parse(await readFile(indexPath, "utf8")) as VideoSummary[];
}

export async function loadBundle(videoId: string): Promise<VideoBundle | null> {
  // Ids come from the URL: only allow the same simple ids the pipeline does.
  if (!isValidVideoId(videoId)) return null;
  const bundlePath = path.join(DEMO_ROOT, videoId, "bundle.json");
  if (!existsSync(bundlePath)) return null;
  return JSON.parse(await readFile(bundlePath, "utf8")) as VideoBundle;
}

export async function loadEval(): Promise<unknown | null> {
  const evalPath = path.join(DEMO_ROOT, "eval.json");
  if (!existsSync(evalPath)) return null;
  return JSON.parse(await readFile(evalPath, "utf8"));
}

// On Vercel the filesystem is read-only: reviews are kept in the browser instead.
// Review pages are prerendered, so this is decided at build time too:
// build the deployment with NAME_IT_DEMO_MODE=1 (see the deploy script).
export function canSaveReviews(): boolean {
  return process.env.VERCEL !== "1" && process.env.NAME_IT_DEMO_MODE !== "1";
}
