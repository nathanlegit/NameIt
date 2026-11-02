import { describe, expect, it } from "vitest";
import {
  budgetWords,
  findNearestGap,
  findOverlaps,
  inlineCueFitsSpeech,
  placeCues,
  speechDurationSec,
  wordCount,
  type CueRequest,
  type PlacedCue,
} from "./placement";
import type { Gap, Turn } from "../types";

function gap(start: number, end: number): Gap {
  return { start, end, durationSec: end - start };
}

// A reference said at referenceTime inside the sentence [sentenceStart, sentenceEnd].
function request(
  id: string,
  referenceTime: number,
  [sentenceStart, sentenceEnd]: [number, number],
  shortText: string,
  longText = `${shortText} long version`,
): CueRequest {
  return { id, referenceTime, sentence: { start: sentenceStart, end: sentenceEnd }, shortText, longText };
}

function turn(start: number, end: number): Turn {
  return { id: `t${start}`, speaker: "presenter", start, end, text: "words" };
}

describe("word budget", () => {
  it("follows the PRD formula: floor((duration - 0.3) x 2.5)", () => {
    expect(budgetWords(2)).toBe(4);       // 1.7 x 2.5 = 4.25
    expect(budgetWords(1.05)).toBe(1);    // 0.75 x 2.5 = 1.875
    expect(budgetWords(0.3)).toBe(0);
    expect(budgetWords(0.1)).toBe(0);
  });

  it("scales with speech rate", () => {
    expect(budgetWords(2, 2)).toBe(8);
  });

  it("counts words and speaking time", () => {
    expect(wordCount("  Two cups of flour. ")).toBe(4);
    expect(wordCount("Center-hole.")).toBe(2);
    expect(wordCount("Salt — a pinch")).toBe(3);
    expect(speechDurationSec("Two cups of flour.")).toBeCloseTo(1.6);
  });
});

describe("findNearestGap", () => {
  it("uses the gap right after the sentence", () => {
    expect(findNearestGap([gap(2, 4), gap(9, 11)], 1, { start: 0, end: 2 })).toEqual(gap(2, 4));
  });

  it("uses the gap right before the sentence", () => {
    expect(findNearestGap([gap(9, 11)], 12, { start: 11, end: 13 })).toEqual(gap(9, 11));
  });

  it("skips a gap separated from the sentence by more speech", () => {
    // clip2: "Then drop this in" (2.9 to 3.9 s) must not use the gap after the NEXT sentence.
    expect(findNearestGap([gap(5.85, 8.06)], 3.3, { start: 2.9, end: 3.88 })).toBeNull();
  });

  it("ignores gaps more than 3 s away", () => {
    expect(findNearestGap([gap(15, 17)], 10.5, { start: 10, end: 15 })).toBeNull();
  });

  it("prefers the earlier gap on a tie (describe before the action)", () => {
    expect(findNearestGap([gap(1, 2), gap(4, 5)], 2.5, { start: 2, end: 4 })).toEqual(gap(1, 2));
  });
});

describe("placeCues", () => {
  it("puts a short cue inline at gap start + 0.15 s", () => {
    const [cue] = placeCues([request("a", 1, [0, 2], "Two cups of flour.")], [gap(2, 4)]);
    expect(cue).toMatchObject({ delivery: "inline", start: 2.15, end: 3.75, text: "Two cups of flour." });
  });

  it("makes a cue extended when the short text does not fit", () => {
    const [cue] = placeCues([request("a", 1, [0, 2], "The large glass bowl of flour.")], [gap(2, 3)]);
    expect(cue).toMatchObject({ delivery: "extended", start: 2, end: 2, text: "The large glass bowl of flour. long version" });
    expect(cue!.reason).toContain("don't fit");
  });

  it("makes a cue extended, pausing at the end of its sentence, when there is no pause next to it", () => {
    const [cue] = placeCues([request("a", 1, [0, 2.5], "Flour.")], [gap(10, 12)]);
    expect(cue).toMatchObject({ delivery: "extended", start: 2.5 });
    expect(cue!.reason).toContain("no pause next to the sentence");
  });

  it("keeps cues in spoken order when the next sentence follows without a pause (clip2 regression)", () => {
    const cues = placeCues(
      [request("drop-this", 3.3, [2.9, 3.88], "Pepper seedling."), request("firm-like-this", 5.4, [4.6, 5.85], "Hand pressing.")],
      [gap(5.85, 8.06)],
    );
    expect(cues.map((cue) => cue.id)).toEqual(["drop-this", "firm-like-this"]);
    expect(cues[0]).toMatchObject({ delivery: "extended", start: 3.88 });
    expect(cues[1]).toMatchObject({ delivery: "inline" });
  });

  it("pauses just after the word, not at the end, in a very long turn (held-meat regression)", () => {
    // One 141 s turn with references at 20 s and 90 s: they must not both wait until 141 s.
    const cues = placeCues(
      [request("early", 20, [0, 141], "Roast."), request("late", 90, [0, 141], "Grade stamp.")],
      [gap(141, 143)],
    );
    expect(cues.map((cue) => [cue.id, cue.delivery, cue.start])).toEqual([["early", "extended", 21.5], ["late", "extended", 91.5]]);
    expect(cues[0]!.reason).toContain("just after the word");
    expect(findOverlaps(cues)).toEqual([]);
  });

  it("still pauses at the end of a normal-length sentence", () => {
    const [cue] = placeCues([request("a", 2, [1, 6], "Flour.")], []);
    expect(cue).toMatchObject({ delivery: "extended", start: 6 });
  });

  it("lets two cues share a long gap, in spoken order", () => {
    const cues = placeCues([request("b", 1.5, [0, 2], "The bowl."), request("a", 1, [0, 2], "Flour.")], [gap(2, 5)]);
    expect(cues.map((cue) => [cue.id, cue.delivery])).toEqual([["a", "inline"], ["b", "inline"]]);
    expect(cues[1]!.start).toBeGreaterThanOrEqual(cues[0]!.end + 0.15);
    expect(findOverlaps(cues)).toEqual([]);
  });

  it("moves the later cue to extended when the shared gap is full", () => {
    const cues = placeCues([request("a", 1, [0, 2], "Two cups of flour."), request("b", 1.5, [0, 2], "The bowl.")], [gap(2, 4)]);
    expect(cues.find((cue) => cue.id === "a")!.delivery).toBe("inline");
    const second = cues.find((cue) => cue.id === "b")!;
    expect(second.delivery).toBe("extended");
    expect(second.reason).toContain("already used");
  });

  it("never produces overlaps or cues that run into speech, on a busy timeline", () => {
    const turns = [turn(0, 2), turn(3.2, 6), turn(6.5, 9), turn(11, 14)];
    const gaps = [gap(2, 3.2), gap(9, 11)];
    const requests = [
      request("a", 1, [0, 2], "Flour."),
      request("b", 1.8, [0, 2], "A wooden spoon."),
      request("c", 5, [3.2, 6], "The whisk."),
      request("d", 8, [6.5, 9], "Smooth, thick batter."),
      request("e", 8.5, [6.5, 9], "The pan."),
    ];
    const cues = placeCues(requests, gaps);
    expect(findOverlaps(cues)).toEqual([]);
    for (const cue of cues.filter((placed) => placed.delivery === "inline")) {
      expect(inlineCueFitsSpeech(cue, turns)).toBe(true);
    }
  });
});

describe("checks", () => {
  const inline = (id: string, start: number, end: number): PlacedCue => ({
    id, delivery: "inline", start, end, text: "x", spokenDurationSec: end - start, gap: null, reason: "",
  });
  const extended = (id: string, at: number): PlacedCue => ({
    id, delivery: "extended", start: at, end: at, text: "x", spokenDurationSec: 2, gap: null, reason: "",
  });

  it("finds overlapping inline cues and pauses inside a spoken cue", () => {
    expect(findOverlaps([inline("a", 1, 3), inline("b", 2, 4)])).toEqual([["a", "b"]]);
    expect(findOverlaps([inline("a", 1, 3), extended("b", 2)])).toEqual([["a", "b"]]);
    expect(findOverlaps([inline("a", 1, 3), extended("b", 3)])).toEqual([]);
  });

  it("flags an inline cue that runs into the next turn", () => {
    const turns = [turn(0, 2), turn(3, 5)];
    expect(inlineCueFitsSpeech(inline("a", 2.15, 2.9), turns)).toBe(true);
    expect(inlineCueFitsSpeech(inline("a", 2.15, 3.2), turns)).toBe(false);
    expect(inlineCueFitsSpeech(inline("a", 1.5, 1.9), turns)).toBe(false); // starts while the presenter talks
  });
});
