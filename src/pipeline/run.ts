// CLI: runs the pipeline stages for one video, in order.
//
//   pnpm run pipeline <videoId> [--from 02] [--to 02] [--force]
//
// A stage is skipped when its outputs already exist, so re-running is cheap.
// --force re-runs every stage in the chosen range. (API responses are cached
// separately under cache/, so --force re-does the work but only re-calls an
// API when its cache file is missing. Delete cache/ for truly fresh calls.)
// Each run of a stage is appended to run_log.json with its time and cost.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { writeJson } from "../lib/cache";
import { loadLocalEnv } from "../meta/client";
import { ingestStage } from "./01_ingest";
import { transcribeStage } from "./02_transcribe";
import { contextStage } from "./03_context";
import { detectStage } from "./04_detect";
import { localiseStage } from "./05_localise";
import { groundStage } from "./06_ground";
import type { Stage } from "./stage";
import { readVideoMeta, videoPaths, writeVideoMeta } from "./store";

// Stages 07 to 09 join this list in M3.
const STAGES: Stage[] = [ingestStage, transcribeStage, contextStage, detectStage, localiseStage, groundStage];

interface RunLogEntry {
  stage: string;
  startedAt: string;
  durationSec: number;
  costUsd: number;
  summary: string;
}

async function appendRunLog(videoId: string, entry: RunLogEntry): Promise<void> {
  const logPath = videoPaths(videoId).runLog;
  const existing: RunLogEntry[] = existsSync(logPath) ? JSON.parse(await readFile(logPath, "utf8")) : [];
  await writeJson(logPath, [...existing, entry]);
}

function selectStages(from: string | undefined, to: string | undefined): Stage[] {
  const knownIds = STAGES.map((stage) => stage.id);
  for (const requested of [from, to]) {
    if (requested && !knownIds.includes(requested)) {
      throw new Error(`Unknown stage "${requested}". Stages: ${STAGES.map((stage) => `${stage.id} ${stage.name}`).join(", ")}`);
    }
  }
  return STAGES.filter((stage) => (!from || stage.id >= from) && (!to || stage.id <= to));
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      from: { type: "string" },
      to: { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  const videoId = positionals[0];
  if (!videoId) throw new Error("Usage: pnpm run pipeline <videoId> [--from 02] [--to 02] [--force]");

  loadLocalEnv();
  await readVideoMeta(videoId); // fails early with a helpful message if the video doesn't exist

  const pipelineStartedAt = Date.now();
  let totalCostUsd = 0;

  for (const stage of selectStages(values.from, values.to)) {
    const label = `${stage.id} ${stage.name}`.padEnd(14);
    const outputsExist = stage.outputs(videoId).every((outputPath) => existsSync(outputPath));
    if (outputsExist && !values.force) {
      console.log(`${label} skipped (outputs exist; --force to re-run)`);
      continue;
    }

    const startedAt = Date.now();
    try {
      const result = await stage.run(videoId);
      const durationSec = (Date.now() - startedAt) / 1000;
      totalCostUsd += result.costUsd;
      console.log(`${label} ${durationSec.toFixed(1).padStart(6)} s  $${result.costUsd.toFixed(4)}  ${result.summary}`);
      await appendRunLog(videoId, {
        stage: `${stage.id}_${stage.name}`,
        startedAt: new Date(startedAt).toISOString(),
        durationSec,
        costUsd: result.costUsd,
        summary: result.summary,
      });
    } catch (error) {
      const meta = await readVideoMeta(videoId);
      await writeVideoMeta({ ...meta, status: "failed" });
      throw new Error(`Stage ${stage.id} ${stage.name} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const totalSec = ((Date.now() - pipelineStartedAt) / 1000).toFixed(1);
  console.log(`Done in ${totalSec} s, estimated cost $${totalCostUsd.toFixed(4)}. Outputs: ${videoPaths(videoId).dir}/`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
