// Builds a narrated demo clip from a spec in scripts/demo-clips/<name>.json:
//   1. downloads each Pexels source (never committed; see CREDITS.md)
//   2. joins them into one silent 1920x1080, 25 fps video
//   3. generates each narration line with ElevenLabs text-to-speech
//   4. places every line at its start time and muxes it onto the video
// Output: data/spike-input/<name>.mp4
//
// Usage: pnpm build-demo-clip clip1
// Needs ELEVENLABS_API_KEY in .env.local (optional ELEVENLABS_VOICE_ID).
// Downloads and generated lines are cached, so re-runs only redo what changed.
//
// Why one TTS call per line instead of one long recording: each line must land
// on the second its object is on screen, and placing separate clips with
// ffmpeg's adelay is exact. Pause tags in a single recording only approximate it.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import { loadLocalEnv } from "../src/meta/client";
import { probeDuration, probeVideo, runCommand } from "../src/lib/ffmpeg";
import { PRESENTER_VOICE_ID, requireElevenLabsKey, synthesise } from "../src/tts/elevenlabs";

interface ClipSpec {
  name: string;
  sources: Array<{ pexelsId: number; pageUrl: string; creator: string; licence: string }>;
  lines: Array<{ start: number; text: string }>;
}

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const OUTPUT_FPS = 25;
// Pexels serves files to a normal browser user agent; the download URL redirects
// to videos.pexels.com.
const BROWSER_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36";

async function downloadPexelsVideo(pexelsId: number, outputPath: string): Promise<void> {
  if (existsSync(outputPath)) return;
  console.log(`Downloading Pexels video ${pexelsId}...`);
  const response = await fetch(`https://www.pexels.com/download/video/${pexelsId}/`, {
    headers: { "User-Agent": BROWSER_USER_AGENT },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Pexels download for ${pexelsId} failed: HTTP ${response.status}`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

// Scales every source into the same 1920x1080 frame (letterboxing if the aspect
// differs), forces 25 fps, and concatenates them. Any original audio is dropped.
async function joinSources(sourcePaths: string[], outputPath: string): Promise<void> {
  if (existsSync(outputPath)) return;
  console.log(`Joining ${sourcePaths.length} sources into one ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT} video...`);
  const perSourceFilters = sourcePaths.map(
    (_, index) =>
      `[${index}:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease,` +
      `pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2,fps=${OUTPUT_FPS},setsar=1[v${index}]`,
  );
  const concatInputs = sourcePaths.map((_, index) => `[v${index}]`).join("");
  const filterGraph = [...perSourceFilters, `${concatInputs}concat=n=${sourcePaths.length}:v=1:a=0[video]`].join(";");

  await runCommand("ffmpeg", [
    "-y", "-loglevel", "error",
    ...sourcePaths.flatMap((sourcePath) => ["-i", sourcePath]),
    "-filter_complex", filterGraph,
    "-map", "[video]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    outputPath,
  ]);
}

interface PlacedLine {
  start: number;
  text: string;
  audioPath: string;
  durationSec: number;
}

async function generateLines(spec: ClipSpec, linesDir: string): Promise<PlacedLine[]> {
  const apiKey = requireElevenLabsKey();
  const voiceId = process.env.ELEVENLABS_VOICE_ID || PRESENTER_VOICE_ID;
  await mkdir(linesDir, { recursive: true });

  const placed: PlacedLine[] = [];
  for (const [index, line] of spec.lines.entries()) {
    // The file name includes a hash of voice + text, so editing a line regenerates only that line.
    const contentHash = createHash("sha1").update(`${voiceId}|${line.text}`).digest("hex").slice(0, 8);
    const audioPath = path.join(linesDir, `line-${String(index).padStart(2, "0")}-${contentHash}.mp3`);
    if (!existsSync(audioPath)) {
      console.log(`  TTS ${index}: "${line.text}"`);
      await writeFile(audioPath, await synthesise(line.text, voiceId, apiKey));
    }
    const durationSec = await probeDuration(audioPath);
    placed.push({ start: line.start, text: line.text, audioPath, durationSec });
  }
  return placed;
}

// A line that runs into the next one would garble both, and a gap under about
// 0.4 s may make Transcribe merge the two into one turn. Warn about both.
function reportTiming(lines: PlacedLine[], videoDurationSec: number): number {
  let problems = 0;
  for (const [index, line] of lines.entries()) {
    const end = line.start + line.durationSec;
    const next = lines[index + 1];
    const gapToNext = next ? next.start - end : videoDurationSec - end;
    const status = gapToNext < 0 ? "OVERLAP" : gapToNext < 0.4 ? "tight" : "ok";
    if (status !== "ok") problems += 1;
    console.log(
      `  ${line.start.toFixed(1).padStart(5)}-${end.toFixed(1).padStart(5)} s  gap ${gapToNext.toFixed(2).padStart(5)} s  ${status.padEnd(7)} ${line.text}`,
    );
  }
  return problems;
}

// Delays each line to its start time, mixes them into one track, pads with
// silence to the video's length, and muxes. The video stream is copied untouched.
async function muxNarration(videoPath: string, lines: PlacedLine[], durationSec: number, outputPath: string): Promise<void> {
  const delayFilters = lines.map((line, index) => {
    const delayMs = Math.round(line.start * 1000);
    return `[${index + 1}:a]aresample=44100,adelay=delays=${delayMs}:all=1[a${index}]`;
  });
  const mixInputs = lines.map((_, index) => `[a${index}]`).join("");
  const filterGraph = [
    ...delayFilters,
    `${mixInputs}amix=inputs=${lines.length}:duration=longest:normalize=0,apad[narration]`,
  ].join(";");

  await runCommand("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", videoPath,
    ...lines.flatMap((line) => ["-i", line.audioPath]),
    "-filter_complex", filterGraph,
    "-map", "0:v", "-map", "[narration]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
    "-t", durationSec.toFixed(3),
    outputPath,
  ]);
}

async function main(): Promise<void> {
  const clipName = process.argv[2];
  if (!clipName) throw new Error("Usage: pnpm build-demo-clip <name>   (reads scripts/demo-clips/<name>.json)");
  loadLocalEnv();

  const spec = JSON.parse(await readFile(path.join("scripts", "demo-clips", `${clipName}.json`), "utf8")) as ClipSpec;
  const inputDir = path.join("data", "spike-input");
  const sourcesDir = path.join(inputDir, "sources");

  const sourcePaths: string[] = [];
  for (const source of spec.sources) {
    const sourcePath = path.join(sourcesDir, `${source.pexelsId}.mp4`);
    await downloadPexelsVideo(source.pexelsId, sourcePath);
    sourcePaths.push(sourcePath);
  }

  const silentVideoPath = path.join(inputDir, `${spec.name}-video.mp4`);
  await joinSources(sourcePaths, silentVideoPath);
  const video = await probeVideo(silentVideoPath);
  console.log(`Silent video: ${video.durationSec.toFixed(2)} s`);

  const lines = await generateLines(spec, path.join(inputDir, `${spec.name}-lines`));
  console.log("Narration timing:");
  const timingProblems = reportTiming(lines, video.durationSec);
  if (timingProblems > 0) {
    console.log(`  ${timingProblems} line(s) overlap or sit too close. Adjust "start" in the spec if needed.`);
  }

  const outputPath = path.join(inputDir, `${spec.name}.mp4`);
  await muxNarration(silentVideoPath, lines, video.durationSec, outputPath);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
