import { readFileSync } from "node:fs";
import path from "node:path";
import { decodeMaskToRaster } from "@meta-sam/parser";
import { describe, expect, it } from "vitest";
import { parseVideoRawOutput, toTracks } from "./sam";

// First 5 frames of a real SAM 3.1 video response (31 Oct 2026): the concept
// "glass jar of walnuts" on a 3 s, 10 fps, 1280x720 window of clip1.
const rawOutput = readFileSync(path.join(__dirname, "__fixtures__", "sam-video-glass-jar.txt"), "utf8");

describe("SAM 3.1 adapter", () => {
  it("re-parses cached raw output without errors", () => {
    const result = parseVideoRawOutput(rawOutput);
    expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  });

  it("groups records into one track per object, sorted by frame", () => {
    const tracks = toTracks(parseVideoRawOutput(rawOutput), "glass jar of walnuts");
    expect(tracks).toHaveLength(1);
    const [jar] = tracks;
    expect(jar!.objectId).toBe("0");
    expect(jar!.boxes.map((trackedBox) => trackedBox.frameIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps the box, confidence and a decodable mask for each frame", () => {
    const [jar] = toTracks(parseVideoRawOutput(rawOutput), "glass jar of walnuts");
    const first = jar!.boxes[0]!;
    expect(first.box).toEqual({ left: 883, top: 290, right: 1142, bottom: 699 });
    expect(first.confidence).toBeCloseTo(0.746, 3);
    const raster = decodeMaskToRaster(first.mask!);
    expect(raster.length).toBe(first.mask!.width * first.mask!.height);
    expect(raster.some((pixel) => pixel === 1)).toBe(true);
  });
});
