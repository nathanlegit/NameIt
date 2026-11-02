// Saves one real SAM 3.1 video response (raw output text) as a test fixture and
// checks that re-parsing it offline gives the same records as the live parse.
// Usage: pnpm tsx scripts/save-sam-fixture.ts <clip.mp4> <concept> <fixture.txt>
import { writeFileSync } from "node:fs";
import { loadLocalEnv } from "../src/meta/client";
import { parseVideoRawOutput, segmentVideoRaw, toTracks } from "../src/meta/sam";

loadLocalEnv();
const [clipPath, concept, fixturePath] = process.argv.slice(2);
const live = await segmentVideoRaw(clipPath!, concept!);
writeFileSync(fixturePath!, live.rawOutput);
const offline = parseVideoRawOutput(live.rawOutput);
const liveTracks = toTracks(live, concept!);
const offlineTracks = toTracks(offline, concept!);
console.log(`raw output: ${live.rawOutput.length} chars`);
console.log(`records live ${live.records.length} / offline ${offline.records.length}`);
console.log(`tracks identical: ${JSON.stringify(liveTracks) === JSON.stringify(offlineTracks)}`);
for (const track of offlineTracks) {
  const masks = track.boxes.filter((box) => box.mask).length;
  console.log(`  object ${track.objectId}: ${track.boxes.length} frames, ${masks} masks, first box ${JSON.stringify(track.boxes[0]?.box)}`);
}
