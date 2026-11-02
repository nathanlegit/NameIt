// One-off check: do the held-out labels line up with the regex candidates (stage 04 A)?
// Uses only the transcript and the deterministic candidate finder, no model output.
import { readFileSync } from "node:fs";
import { findDeicticCandidates } from "../src/lib/deixis";
import type { EvalReferenceLabel, Turn } from "../src/types";

for (const id of process.argv.slice(2)) {
  const turns = JSON.parse(readFileSync(`data/videos/${id}/transcript.json`, "utf8")) as Turn[];
  const labels = JSON.parse(readFileSync(`data/prelinger/${id}.labels.json`, "utf8")) as EvalReferenceLabel[];
  const candidates = turns.flatMap((turn) => findDeicticCandidates(turn).map((match) => ({ time: turn.start, phrase: match.phrase.toLowerCase(), offset: match.charOffset })));
  const key = (time: number, phrase: string) => `${time.toFixed(2)}|${phrase.toLowerCase()}`;
  const count = (items: Array<{ time: number; phrase: string }>) => {
    const map = new Map<string, number>();
    for (const item of items) map.set(key(item.time, item.phrase), (map.get(key(item.time, item.phrase)) ?? 0) + 1);
    return map;
  };
  const candidateCounts = count(candidates);
  const labelCounts = count(labels);
  const keys = new Set([...candidateCounts.keys(), ...labelCounts.keys()]);
  let mismatches = 0;
  for (const k of keys) {
    if ((candidateCounts.get(k) ?? 0) !== (labelCounts.get(k) ?? 0)) {
      mismatches++;
      console.log(`${id} MISMATCH ${k}: candidates ${candidateCounts.get(k) ?? 0}, labels ${labelCounts.get(k) ?? 0}`);
    }
  }
  console.log(`${id}: ${candidates.length} candidates, ${labels.length} labels, ${mismatches} mismatched keys, ${turns.length} turns`);
  // Spoken order within each turn: print label order for same-turn duplicates.
  for (const label of labels) console.log(`  ${label.time.toFixed(1)} ${JSON.stringify(label.phrase)} ${label.isVisual ? "V" : "-"} ${label.trueReferent.slice(0, 90)}`);
}
