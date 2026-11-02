// Where each video's files live, and reading/writing its meta.json.
// Everything for one video sits in data/videos/<videoId>/, one file per stage,
// so you can open any stage's output and see exactly what it produced.

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { writeJson } from "../lib/cache";
import { probeVideo } from "../lib/ffmpeg";
import type { VideoMeta } from "../types";

export const VIDEOS_ROOT = path.join("data", "videos");

export function videoDir(videoId: string): string {
  return path.join(VIDEOS_ROOT, videoId);
}

// One place for every file name, so stages never hard-code paths.
export function videoPaths(videoId: string) {
  const dir = videoDir(videoId);
  return {
    dir,
    meta: path.join(dir, "meta.json"),
    runLog: path.join(dir, "run_log.json"),
    // 01_ingest
    audio: path.join(dir, "audio.wav"),
    framesDir: path.join(dir, "frames"),
    firstFrame: path.join(dir, "frames", "frame_00001.jpg"),
    // 02_transcribe
    speechSegments: path.join(dir, "speech_segments.json"),
    segmentAudioDir: path.join(dir, "segments"),
    transcript: path.join(dir, "transcript.json"),
    gaps: path.join(dir, "gaps.json"),
    // 03_context
    keyframes: path.join(dir, "keyframes.json"),
    glossary: path.join(dir, "glossary.json"),
    // 04_detect
    references: path.join(dir, "references.json"),
    // 05_localise
    localised: path.join(dir, "localised.json"),
    // 06_ground
    grounding: path.join(dir, "grounding.json"),
    clipsDir: path.join(dir, "clips"),
    evidenceDir: path.join(dir, "evidence"),
    // 07_resolve
    resolutions: path.join(dir, "resolutions.json"),
    // 09_cues
    cues: path.join(dir, "cues.json"),
    descriptionsVtt: path.join(dir, "descriptions.vtt"),
    // API response cache (delete a file to force a fresh call)
    cacheDir: path.join(dir, "cache"),
  };
}

// Video ids appear in URLs (/review/<id>) and folder names, so keep them simple.
const VIDEO_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function assertValidVideoId(videoId: string): void {
  if (!VIDEO_ID_PATTERN.test(videoId)) {
    throw new Error(`Video id "${videoId}" must be lowercase letters, digits and dashes (e.g. "banana-bread-1").`);
  }
}

export async function readVideoMeta(videoId: string): Promise<VideoMeta> {
  const metaPath = videoPaths(videoId).meta;
  if (!existsSync(metaPath)) {
    throw new Error(`No video "${videoId}". Add it first: pnpm add-video <file> ${videoId}`);
  }
  return JSON.parse(await readFile(metaPath, "utf8")) as VideoMeta;
}

export async function writeVideoMeta(meta: VideoMeta): Promise<void> {
  await writeJson(videoPaths(meta.id).meta, meta);
}

export async function countFrames(videoId: string): Promise<number> {
  const files = await readdir(videoPaths(videoId).framesDir);
  return files.filter((name) => name.endsWith(".jpg")).length;
}

// The size of the 2 fps frames (and of the grounding clips, which are scaled
// the same way). SAM's boxes are in these pixels.
export async function frameSize(videoId: string): Promise<{ width: number; height: number }> {
  const probed = await probeVideo(videoPaths(videoId).firstFrame);
  return { width: probed.width, height: probed.height };
}
