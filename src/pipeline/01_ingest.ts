// Stage 01, ingest (F1): validate the video, extract audio, sample frames.
//
// Outputs in data/videos/<id>/:
//   audio.wav  mono 16 kHz 16-bit PCM, the format Transcribe accepts
//   frames/    JPEGs at 2 fps, max 1280 px wide (frame N = time (N-1)/2 s)
//   meta.json  updated with duration, fps and resolution

import { rm } from "node:fs/promises";
import { extractAudio, probeVideo, sampleFrames } from "../lib/ffmpeg";
import type { Stage } from "./stage";
import { readVideoMeta, videoPaths, writeVideoMeta } from "./store";

// Transcribe's batch limit is 10 minutes of audio per request. We transcribe
// segment by segment, but keep the PRD's 10-minute product limit.
export const MAX_DURATION_SEC = 600;

export const ingestStage: Stage = {
  id: "01",
  name: "ingest",
  outputs: (videoId) => [videoPaths(videoId).audio, videoPaths(videoId).firstFrame],

  async run(videoId) {
    const paths = videoPaths(videoId);
    const meta = await readVideoMeta(videoId);

    const probed = await probeVideo(meta.sourcePath);
    if (!probed.hasAudio) {
      throw new Error("This video has no audio track, so there is no speech to resolve.");
    }
    if (probed.durationSec > MAX_DURATION_SEC) {
      throw new Error(`Video is ${(probed.durationSec / 60).toFixed(1)} minutes; the limit is 10.`);
    }

    await extractAudio(meta.sourcePath, paths.audio);

    // Clear old frames first: a re-run on a shorter video would otherwise
    // leave stale frames from the previous run at the end.
    await rm(paths.framesDir, { recursive: true, force: true });
    const frameCount = await sampleFrames(meta.sourcePath, paths.framesDir);

    await writeVideoMeta({
      ...meta,
      durationSec: probed.durationSec,
      fps: probed.fps,
      width: probed.width,
      height: probed.height,
      status: "processing",
    });

    return {
      summary: `${probed.durationSec.toFixed(1)} s, ${probed.width}x${probed.height} @ ${probed.fps} fps, ${frameCount} frames`,
      costUsd: 0,
    };
  },
};
