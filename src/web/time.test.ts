import { describe, expect, it } from "vitest";
import { formatClock, spokenTime } from "./time";

describe("formatClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(75.4)).toBe("1:15");
    expect(formatClock(605)).toBe("10:05");
  });

  it("never shows 60 seconds (the old video list rounded 119.6 s to 1:60)", () => {
    expect(formatClock(119.6)).toBe("1:59");
  });

  it("treats negative times as zero", () => {
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("spokenTime", () => {
  it("reads naturally for screen readers", () => {
    expect(spokenTime(9.9)).toBe("9 s");
    expect(spokenTime(75.4)).toBe("1 min 15 s");
  });
});
