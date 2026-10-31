import { describe, expect, it } from "vitest";
import { computeGaps } from "./gaps";
import type { Turn } from "../types";

function turn(start: number, end: number, text = "words"): Turn {
  return { id: `t${start}`, speaker: "presenter", start, end, text };
}

describe("computeGaps", () => {
  it("finds gaps before, between and after turns", () => {
    const gaps = computeGaps([turn(1.5, 3), turn(5, 8)], 10);
    expect(gaps).toEqual([
      { start: 0, end: 1.5, durationSec: 1.5 },
      { start: 3, end: 5, durationSec: 2 },
      { start: 8, end: 10, durationSec: 2 },
    ]);
  });

  it("ignores pauses shorter than the minimum", () => {
    const gaps = computeGaps([turn(0, 3), turn(3.9, 6)], 6);
    expect(gaps).toEqual([]);
  });

  it("counts a pause of exactly the minimum as a gap", () => {
    const gaps = computeGaps([turn(0, 3), turn(4, 6)], 6);
    expect(gaps).toEqual([{ start: 3, end: 4, durationSec: 1 }]);
  });

  it("treats turns with no words (music, noise) as gap time", () => {
    const gaps = computeGaps([turn(0, 2), turn(2, 6, "   "), turn(6, 8)], 8);
    expect(gaps).toEqual([{ start: 2, end: 6, durationSec: 4 }]);
  });

  it("does not open a fake gap when a turn sits inside a longer one", () => {
    const gaps = computeGaps([turn(0, 10), turn(2, 3), turn(10.5, 12)], 12);
    expect(gaps).toEqual([]);
  });

  it("sorts turns that arrive out of order", () => {
    const gaps = computeGaps([turn(5, 8), turn(1.5, 3)], 8);
    expect(gaps.map((gap) => gap.start)).toEqual([0, 3]);
  });

  it("returns the whole video as one gap when nobody speaks", () => {
    expect(computeGaps([], 12)).toEqual([{ start: 0, end: 12, durationSec: 12 }]);
  });
});
