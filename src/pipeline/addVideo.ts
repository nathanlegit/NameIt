// CLI: registers a local video file as a Name It video.
//
//   pnpm add-video <file> <videoId> [--title "..."] [--domain cooking]
//                  [--licence "Pexels License"] [--attribution "..."] [--force]
//
// Copies the file to data/videos/<videoId>/source.<ext> and writes meta.json
// with status "uploaded". Then run: pnpm run-pipeline <videoId>

import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { KNOWN_DOMAINS } from "../lib/domainKeywords";
import type { VideoMeta } from "../types";
import { assertValidVideoId, videoDir, writeVideoMeta } from "./store";

export const ACCEPTED_EXTENSIONS = [".mp4", ".webm", ".mov"];
export const MAX_FILE_BYTES = 500 * 1024 * 1024; // PRD F1: 500 MB

export interface AddVideoInput {
  filePath: string;
  videoId: string;
  title?: string;
  domainHint?: string | null;
  licence?: string;
  attribution?: string;
  overwrite?: boolean;
}

export async function addVideo(input: AddVideoInput): Promise<VideoMeta> {
  assertValidVideoId(input.videoId);

  const extension = path.extname(input.filePath).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    throw new Error(`"${extension || "no extension"}" is not supported. Use one of: ${ACCEPTED_EXTENSIONS.join(", ")}.`);
  }
  const fileInfo = await stat(input.filePath);
  if (fileInfo.size > MAX_FILE_BYTES) {
    throw new Error(`File is ${(fileInfo.size / 1024 / 1024).toFixed(0)} MB; the limit is 500 MB.`);
  }

  const dir = videoDir(input.videoId);
  if (existsSync(dir)) {
    if (!input.overwrite) throw new Error(`Video "${input.videoId}" already exists. Pass --force to replace it.`);
    await rm(dir, { recursive: true });
  }
  await mkdir(dir, { recursive: true });

  const sourcePath = path.join(dir, `source${extension}`);
  await copyFile(input.filePath, sourcePath);

  // Duration, size and fps are filled in by 01_ingest.
  const meta: VideoMeta = {
    id: input.videoId,
    title: input.title ?? input.videoId,
    domainHint: input.domainHint ?? null,
    sourcePath,
    durationSec: 0,
    fps: 0,
    width: 0,
    height: 0,
    licence: input.licence ?? "unknown",
    attribution: input.attribution ?? "",
    status: "uploaded",
  };
  await writeVideoMeta(meta);
  return meta;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      title: { type: "string" },
      domain: { type: "string" },
      licence: { type: "string" },
      attribution: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  const [filePath, videoId] = positionals;
  if (!filePath || !videoId) {
    throw new Error('Usage: pnpm add-video <file> <videoId> [--title "..."] [--domain cooking] [--licence "..."] [--attribution "..."] [--force]');
  }
  if (values.domain && !KNOWN_DOMAINS.includes(values.domain.toLowerCase())) {
    console.warn(`Note: no keyword list for domain "${values.domain}" (known: ${KNOWN_DOMAINS.join(", ")}). Transcription will run without biasing.`);
  }

  const meta = await addVideo({
    filePath,
    videoId,
    title: values.title,
    domainHint: values.domain ?? null,
    licence: values.licence,
    attribution: values.attribution,
    overwrite: values.force,
  });
  console.log(`Added "${meta.title}" as ${meta.id} (${meta.sourcePath}).`);
  console.log(`Next: pnpm run-pipeline ${meta.id}`);
}

// Only run the CLI when this file is executed directly, not when imported.
// pathToFileURL matters here: the project folder has a space ("Name It"),
// which a URL encodes as %20, so a plain string comparison would never match.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
