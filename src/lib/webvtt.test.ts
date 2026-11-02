import { describe, expect, it } from "vitest";
import { formatVttTime, toWebVtt } from "./webvtt";

describe("formatVttTime", () => {
  it("formats hours, minutes, seconds and milliseconds", () => {
    expect(formatVttTime(0)).toBe("00:00:00.000");
    expect(formatVttTime(75.5)).toBe("00:01:15.500");
    expect(formatVttTime(3725.0049)).toBe("01:02:05.005");
  });
});

describe("toWebVtt", () => {
  it("writes a header and cues in time order, escaping the text", () => {
    const vtt = toWebVtt([
      { id: "cue-2", start: 5, end: 6.2, text: "Salt & pepper <2 pinches>", extended: false },
      { id: "cue-1", start: 2.15, end: 3.75, text: "Two cups of flour.", extended: false },
    ]);
    expect(vtt).toBe(
      "WEBVTT\n\n" +
        "cue-1\n00:00:02.150 --> 00:00:03.750\nTwo cups of flour.\n\n" +
        "cue-2\n00:00:05.000 --> 00:00:06.200\nSalt &amp; pepper &lt;2 pinches&gt;\n",
    );
  });

  it("cuts a cue short where the next one starts", () => {
    const vtt = toWebVtt([
      { id: "a", start: 2, end: 7.5, text: "A long extended cue.", extended: true },
      { id: "b", start: 6, end: 7.2, text: "Seedling.", extended: false },
    ]);
    expect(vtt).toContain("00:00:02.000 --> 00:00:06.000");
  });

  it("marks extended cues with a NOTE", () => {
    const vtt = toWebVtt([{ id: "cue-1", start: 4, end: 7, text: "A hand presses the soil.", extended: true }]);
    expect(vtt).toContain("NOTE extended description");
    expect(vtt).toContain("00:00:04.000 --> 00:00:07.000");
  });
});
