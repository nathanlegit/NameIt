import { describe, expect, it } from "vitest";
import { cueAudioKey } from "./cueAudio";

describe("cueAudioKey", () => {
  it("is stable and ignores surrounding or repeated whitespace", () => {
    expect(cueAudioKey("Two cups of flour.")).toBe(cueAudioKey("  Two cups  of flour. "));
    expect(cueAudioKey("Two cups of flour.")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("changes when the words change, so an edited cue never plays old audio", () => {
    expect(cueAudioKey("Two cups of flour.")).not.toBe(cueAudioKey("Three cups of flour."));
  });
});
