import { describe, expect, it } from "vitest";
import { parseSilenceDetectLog, speechSegmentsFromSilences } from "./silence";

// Real lines from ffmpeg 9 on data/spike/synthetic/audio.wav (31 Oct 2026).
const SAMPLE_LOG = `
[silencedetect @ 0x600001b0c000] silence_start: 3.217688
[silencedetect @ 0x600001b0c000] silence_end: 4.947 | silence_duration: 1.729312
size=N/A time=00:00:05.00 bitrate=N/A speed= 900x
[silencedetect @ 0x600001b0c000] silence_start: 6.56
[silencedetect @ 0x600001b0c000] silence_end: 7.971312 | silence_duration: 1.411312
[silencedetect @ 0x600001b0c000] silence_start: 16.5
`;

describe("parseSilenceDetectLog", () => {
  it("pairs starts with ends and ignores other lines", () => {
    const silences = parseSilenceDetectLog(SAMPLE_LOG, 16.96);
    expect(silences[0]).toEqual({ start: 3.217688, end: 4.947 });
    expect(silences[1]).toEqual({ start: 6.56, end: 7.971312 });
  });

  it("closes a silence that runs to the end of the audio", () => {
    const silences = parseSilenceDetectLog(SAMPLE_LOG, 16.96);
    expect(silences[2]).toEqual({ start: 16.5, end: 16.96 });
  });

  it("clamps a slightly negative start (ffmpeg does this at time zero) to 0", () => {
    const silences = parseSilenceDetectLog("silence_start: -0.002\nsilence_end: 1.2 | silence_duration: 1.2", 5);
    expect(silences).toEqual([{ start: 0, end: 1.2 }]);
  });

  it("returns nothing for audio with no silence", () => {
    expect(parseSilenceDetectLog("size=N/A time=00:00:05.00", 5)).toEqual([]);
  });
});

describe("speechSegmentsFromSilences", () => {
  it("returns the stretches between silences, including the edges", () => {
    const segments = speechSegmentsFromSilences(
      [{ start: 3, end: 5 }, { start: 7, end: 8 }],
      10,
    );
    expect(segments).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 7 },
      { start: 8, end: 10 },
    ]);
  });

  it("returns the whole audio when there is no silence", () => {
    expect(speechSegmentsFromSilences([], 10)).toEqual([{ start: 0, end: 10 }]);
  });

  it("drops slivers too short to be speech", () => {
    const segments = speechSegmentsFromSilences(
      [{ start: 0, end: 2 }, { start: 2.1, end: 5 }],
      5,
    );
    expect(segments).toEqual([]);
  });

  it("handles overlapping or unsorted silences", () => {
    const segments = speechSegmentsFromSilences(
      [{ start: 6, end: 8 }, { start: 1, end: 3 }, { start: 2, end: 4 }],
      10,
    );
    expect(segments).toEqual([
      { start: 0, end: 1 },
      { start: 4, end: 6 },
      { start: 8, end: 10 },
    ]);
  });
});
