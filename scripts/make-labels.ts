// Turns a narrated clip's script (scripts/demo-clips/<name>.json) into eval
// labels (src/eval/labels/<name>.json, EvalReferenceLabel[]).
//
// For clips we narrate ourselves, the right answers are known by construction:
// we wrote "Take a spoon of this" knowing what "this" is. Every label still
// needs a human read-through before the eval relies on it (PRD 13.1).
//
// Usage: pnpm make-labels clip1

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvalReferenceLabel } from "../src/types";

interface ScriptLine {
  start: number;
  text: string;
  expected?: Array<{ phrase: string; isVisual: boolean; kind: string | null; referent: string; alternatives?: string[] }>;
}

async function main(): Promise<void> {
  const clipName = process.argv[2];
  if (!clipName) throw new Error("Usage: pnpm make-labels <clip name>");

  const spec = JSON.parse(await readFile(path.join("scripts", "demo-clips", `${clipName}.json`), "utf8")) as {
    lines: ScriptLine[];
  };

  const labels: EvalReferenceLabel[] = spec.lines.flatMap((line) =>
    (line.expected ?? []).map((expected) => ({
      videoId: clipName,
      time: line.start,
      phrase: expected.phrase,
      isVisual: expected.isVisual,
      trueReferent: expected.referent,
      acceptableAlternatives: expected.alternatives ?? [],
    })),
  );

  const outputPath = path.join("src", "eval", "labels", `${clipName}.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(labels, null, 2)}\n`);
  const visual = labels.filter((label) => label.isVisual).length;
  console.log(`Wrote ${outputPath}: ${labels.length} labels (${visual} visual, ${labels.length - visual} decoys).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
