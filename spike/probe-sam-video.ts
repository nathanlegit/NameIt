// Probe: runs SAM 3.1 video tracking on a short clip for a few concepts and
// prints each tracked object. Used on 31 Oct to verify the video API shape.
// Usage: npx tsx spike/probe-sam-video.ts <clip.mp4> <output-dir>

import { loadLocalEnv } from "../src/meta/client";
import { segmentVideoRaw } from "../src/meta/sam";
import { recordsOfKind } from "@meta-sam/parser";
import { writeFileSync } from "node:fs";
loadLocalEnv();
for (const concept of ["jar", "glass jar of walnuts", "hand"]) {
  const t0 = Date.now();
  const result = await segmentVideoRaw(process.argv[2]!, concept);
  const boxes = recordsOfKind(result.records, "box");
  const byObject = new Map<string, { frames: number[]; first: any; last: any; conf: number[] }>();
  for (const b of boxes) {
    const entry = byObject.get(b.objectId) ?? { frames: [], first: b, last: b, conf: [] };
    entry.frames.push(b.frame?.frameIndex ?? -1); entry.last = b; if (b.confidence !== undefined) entry.conf.push(b.confidence);
    byObject.set(b.objectId, entry);
  }
  console.log(`\n"${concept}": ${((Date.now()-t0)/1000).toFixed(1)} s, ${boxes.length} box records, ${byObject.size} objects, diagnostics ${result.diagnostics.length}`);
  for (const [id, e] of byObject) {
    const box = (b: any) => `[${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}]`;
    console.log(`  obj ${id}: frames ${Math.min(...e.frames)}..${Math.max(...e.frames)} (${e.frames.length}), first ${box(e.first)} last ${box(e.last)}, conf ${e.conf.length ? Math.min(...e.conf).toFixed(2) + "-" + Math.max(...e.conf).toFixed(2) : "none"}`);
  }
  writeFileSync(`${process.argv[3]}/probe-${concept.replace(/\W+/g, "_")}.raw.txt`, result.rawOutput.slice(0, 3000));
}
