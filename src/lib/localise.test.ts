import { describe, expect, it } from "vitest";
import { estimateWordTime, frameNumbersInWindow, timeOfFrameNumber, windowAroundEstimate } from "./localise";

const turn = { id: "t0", speaker: "presenter", start: 10, end: 14, text: "Now add this to the bowl please" };

describe("estimateWordTime", () => {
  it("places a word by its share of the text", () => {
    // "this" starts at character 8 of 31: about a quarter of the way through 4 s.
    expect(estimateWordTime(turn, 8)).toBeCloseTo(10 + (8 / 31) * 4);
  });

  it("puts the first character at the turn's start", () => {
    expect(estimateWordTime(turn, 0)).toBe(10);
  });
});

describe("windowAroundEstimate", () => {
  it("spans 1.5 s either side when there is room", () => {
    expect(windowAroundEstimate({ start: 0, end: 60 }, 7)).toEqual({ start: 5.5, end: 8.5 });
  });

  it("clamps to the bounds it is given", () => {
    expect(windowAroundEstimate({ start: 0, end: 60 }, 0.5)).toEqual({ start: 0, end: 2 });
    expect(windowAroundEstimate(turn, 13.5)).toEqual({ start: 12, end: 14 });
  });
});

describe("frame mapping", () => {
  it("maps 2 fps frame files to times", () => {
    expect(timeOfFrameNumber(1)).toBe(0);
    expect(timeOfFrameNumber(15)).toBe(7);
  });

  it("lists every frame inside a window", () => {
    // 5.5 to 8.5 s at 2 fps: frames at 5.5, 6.0, ... 8.5 s
    expect(frameNumbersInWindow({ start: 5.5, end: 8.5 }, 200)).toEqual([12, 13, 14, 15, 16, 17, 18]);
  });

  it("never returns frames past the end of the video", () => {
    expect(frameNumbersInWindow({ start: 63, end: 66 }, 130)).toEqual([127, 128, 129, 130]);
  });
});
