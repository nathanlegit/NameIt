import { describe, expect, it } from "vitest";
import { chooseKeyframeTimes, parseSceneChangeTimes } from "./keyframes";

describe("parseSceneChangeTimes", () => {
  it("reads pts_time from showinfo lines", () => {
    const log = `[Parsed_showinfo_2 @ 0x1] n:   0 pts:  61200 pts_time:24.48   duration:1000\n[Parsed_showinfo_2 @ 0x1] n:   1 pts:  90000 pts_time:36   duration:1000`;
    expect(parseSceneChangeTimes(log)).toEqual([24.48, 36]);
  });
});

describe("chooseKeyframeTimes", () => {
  it("returns the target count, in time order, covering the whole video", () => {
    const keyframes = chooseKeyframeTimes(100, [], 10);
    expect(keyframes).toHaveLength(10);
    expect(keyframes[0]!.time).toBe(5);
    expect(keyframes.at(-1)!.time).toBe(95);
    expect(keyframes.every((keyframe, index) => index === 0 || keyframe.time > keyframes[index - 1]!.time)).toBe(true);
  });

  it("includes scene changes and labels them", () => {
    const keyframes = chooseKeyframeTimes(65, [24.48], 20);
    expect(keyframes).toContainEqual({ time: 24.48, reason: "scene_change" });
  });

  it("caps scene changes at half the budget", () => {
    const manyCuts = Array.from({ length: 30 }, (_, index) => index * 3 + 0.2);
    const keyframes = chooseKeyframeTimes(100, manyCuts, 10);
    expect(keyframes.filter((keyframe) => keyframe.reason === "scene_change")).toHaveLength(5);
  });

  it("never picks two frames less than a second apart", () => {
    const keyframes = chooseKeyframeTimes(10, [2.4, 2.6], 20);
    for (let index = 1; index < keyframes.length; index++) {
      expect(keyframes[index]!.time - keyframes[index - 1]!.time).toBeGreaterThanOrEqual(1);
    }
  });
});
