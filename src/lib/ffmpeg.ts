// Thin wrappers around the ffmpeg and ffprobe command-line tools.
// We call them with explicit argument arrays (no shell, no fluent-ffmpeg) so
// you can copy any command from the logs and run it by hand.

import { spawn } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import type { PixelBox } from "../meta/sam";

export function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) resolve(stdout);
      else reject(new Error(`${command} exited with ${exitCode}:\n${stderr.slice(-1500)}`));
    });
  });
}

// silencedetect reports to stderr, and ffmpeg writes no real output here (-f null),
// so this variant returns stderr instead of stdout.
function runCommandForStderr(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) resolve(stderr);
      else reject(new Error(`${command} exited with ${exitCode}:\n${stderr.slice(-1500)}`));
    });
  });
}

export const SILENCE_THRESHOLD_DB = -35;  // quieter than this counts as silence
export const SILENCE_MIN_DURATION_SEC = 0.4; // shorter dips are pauses within a sentence

// Returns ffmpeg's silencedetect log. Parse it with parseSilenceDetectLog().
export async function detectSilenceLog(
  wavPath: string,
  thresholdDb: number = SILENCE_THRESHOLD_DB,
  minDurationSec: number = SILENCE_MIN_DURATION_SEC,
): Promise<string> {
  return runCommandForStderr("ffmpeg", [
    "-hide_banner", "-nostats",
    "-i", wavPath,
    "-af", `silencedetect=noise=${thresholdDb}dB:d=${minDurationSec}`,
    "-f", "null", "-",
  ]);
}

// Copies [startSec, endSec) of a WAV into a new WAV with the same format.
export async function cutAudio(wavPath: string, startSec: number, endSec: number, outputPath: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runCommand("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", wavPath,
    "-ss", startSec.toFixed(3),
    "-to", endSec.toFixed(3),
    "-c:a", "pcm_s16le",
    outputPath,
  ]);
}

// Logs every frame where the picture changes a lot (a cut or a big camera move).
// Run on a small copy of the picture: scene detection doesn't need 4K.
// Parse the result with parseSceneChangeTimes().
export const SCENE_CHANGE_THRESHOLD = 0.3; // 0 = identical frames, 1 = completely different

export async function detectSceneChangeLog(videoPath: string): Promise<string> {
  return runCommandForStderr("ffmpeg", [
    "-hide_banner", "-nostats",
    "-i", videoPath,
    "-an",
    "-vf", `scale=320:-2,select='gt(scene,${SCENE_CHANGE_THRESHOLD})',showinfo`,
    "-f", "null", "-",
  ]);
}

export const GROUNDING_CLIP_FPS = 10;

// Cuts a short silent clip for SAM video tracking, scaled exactly like the
// 2 fps frames (max 1280 wide), so SAM's pixel coordinates line up with them.
// Frame k of the clip shows time startSec + k / GROUNDING_CLIP_FPS.
export async function cutVideoClip(
  videoPath: string,
  startSec: number,
  durationSec: number,
  outputPath: string,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runCommand("ffmpeg", [
    "-y", "-loglevel", "error",
    "-ss", startSec.toFixed(3),   // before -i: fast seek (frame-accurate when re-encoding)
    "-i", videoPath,
    "-t", durationSec.toFixed(3),
    "-an",
    "-vf", `fps=${GROUNDING_CLIP_FPS},scale='min(${FRAME_MAX_WIDTH},iw)':-2`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23",
    outputPath,
  ]);
}

// Saves frame number `frameIndex` (0-based) of a clip as a JPEG. Evidence is
// drawn on this exact frame: SAM's boxes belong to the clip's frames, and the
// nearest 2 fps frame can show a moving hand up to a quarter second away.
export async function extractClipFrame(clipPath: string, frameIndex: number, outputPath: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await runCommand("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", clipPath,
    "-vf", `select=eq(n\\,${frameIndex})`,
    "-frames:v", "1",
    "-q:v", "3",
    outputPath,
  ]);
}

export interface ProbedVideo {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

// Duration of any media file in seconds (audio or video).
export async function probeDuration(mediaPath: string): Promise<number> {
  const output = await runCommand("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mediaPath]);
  return Number(output.trim());
}

export async function probeVideo(videoPath: string): Promise<ProbedVideo> {
  const output = await runCommand("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    videoPath,
  ]);
  const probe = JSON.parse(output) as {
    format: { duration?: string };
    streams: Array<{ codec_type: string; width?: number; height?: number; avg_frame_rate?: string }>;
  };

  const videoStream = probe.streams.find((stream) => stream.codec_type === "video");
  if (!videoStream) throw new Error(`No video stream in ${videoPath}`);

  // avg_frame_rate arrives as a fraction string like "30000/1001".
  const [numerator, denominator] = (videoStream.avg_frame_rate ?? "0/1").split("/").map(Number);
  const fps = denominator ? (numerator ?? 0) / denominator : 0;

  return {
    durationSec: Number(probe.format.duration ?? 0),
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    fps: Math.round(fps * 100) / 100,
    hasAudio: probe.streams.some((stream) => stream.codec_type === "audio"),
  };
}

// Mono, 16 kHz, 16-bit PCM WAV: a format Muse Voice Transcribe accepts.
// 16 kHz (not 24 kHz) keeps a 10-minute file at about 19 MB, under the 32 MB limit.
export async function extractAudio(videoPath: string, wavPath: string): Promise<void> {
  await runCommand("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", videoPath,
    "-vn",              // drop video
    "-ac", "1",         // mono
    "-ar", "16000",     // 16 kHz
    "-sample_fmt", "s16",
    wavPath,
  ]);
}

export const FRAME_SAMPLE_FPS = 2;
const FRAME_MAX_WIDTH = 1280;

// Samples frames at 2 fps to frames/frame_00001.jpg, frame_00002.jpg, ...
// Frame N (1-based) shows the video at time (N - 1) / 2 seconds.
// Frames are capped at 1280 px wide: plenty for Spark and SAM, and smaller uploads.
//
// round=up matters: the fps filter keeps the LAST source frame in each slot.
// With the default rounding (near), the slot for 13.5 s runs to 13.75 s, so
// "13.5 s" showed 13.7 s: a moving hand was visibly off from SAM's boxes.
// With round=up the slot ends at 13.5 s (measured: within one source frame).
export async function sampleFrames(videoPath: string, framesDir: string): Promise<number> {
  await mkdir(framesDir, { recursive: true });
  await runCommand("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", videoPath,
    "-vf", `fps=${FRAME_SAMPLE_FPS}:round=up,scale='min(${FRAME_MAX_WIDTH},iw)':-2`,
    "-q:v", "3",        // JPEG quality (2 = best, 31 = worst)
    path.join(framesDir, "frame_%05d.jpg"),
  ]);
  const files = await readdir(framesDir);
  return files.filter((name) => name.endsWith(".jpg")).length;
}

// Cuts a close-up of one box out of a frame, with some context around it
// (paddingFraction of the box size on each side), clamped to the frame.
export async function cropImage(
  inputImagePath: string,
  outputImagePath: string,
  box: PixelBox,
  frame: { width: number; height: number },
  paddingFraction = 0.25,
): Promise<void> {
  const padX = (box.right - box.left) * paddingFraction;
  const padY = (box.bottom - box.top) * paddingFraction;
  const left = Math.max(0, Math.floor(box.left - padX));
  const top = Math.max(0, Math.floor(box.top - padY));
  const right = Math.min(frame.width, Math.ceil(box.right + padX));
  const bottom = Math.min(frame.height, Math.ceil(box.bottom + padY));
  await mkdir(path.dirname(outputImagePath), { recursive: true });
  await runCommand("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", inputImagePath,
    "-vf", `crop=${Math.max(1, right - left)}:${Math.max(1, bottom - top)}:${left}:${top}`,
    "-q:v", "3",
    outputImagePath,
  ]);
}

export interface BoxToDraw {
  box: PixelBox;
  colour: string;     // ffmpeg colour name, e.g. "lime", "yellow", "red"
  thickness: number;
}

// Draws rectangles on a frame so a person can see what SAM found: the evidence
// overlay JPEG (green = chosen, yellow = hands, red = others). Spark looks at it
// in stage 07; the review UI draws the real mask outline as SVG instead.
export async function drawBoxesOnImage(
  inputImagePath: string,
  outputImagePath: string,
  boxes: BoxToDraw[],
): Promise<void> {
  await mkdir(path.dirname(outputImagePath), { recursive: true });
  if (boxes.length === 0) {
    await runCommand("ffmpeg", ["-y", "-loglevel", "error", "-i", inputImagePath, outputImagePath]);
    return;
  }
  const drawFilters = boxes.map(({ box, colour, thickness }) => {
    const x = Math.round(box.left);
    const y = Math.round(box.top);
    const width = Math.max(1, Math.round(box.right - box.left));
    const height = Math.max(1, Math.round(box.bottom - box.top));
    return `drawbox=x=${x}:y=${y}:w=${width}:h=${height}:color=${colour}:t=${thickness}`;
  });
  await runCommand("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", inputImagePath,
    "-vf", drawFilters.join(","),
    "-q:v", "3",
    outputImagePath,
  ]);
}
