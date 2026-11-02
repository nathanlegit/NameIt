import { describe, expect, it } from "vitest";
import { excerptAround } from "./text";

describe("excerptAround", () => {
  it("returns a short sentence whole", () => {
    expect(excerptAround("Now add this to the bowl.", 8, 4)).toEqual({ before: "Now add ", phrase: "this", after: " to the bowl." });
  });

  it("cuts a long turn at word boundaries around the phrase", () => {
    const words = Array.from({ length: 200 }, (_, index) => `w${index}`);
    const text = `${words.slice(0, 100).join(" ")} this ${words.slice(100).join(" ")}`;
    const offset = text.indexOf(" this ") + 1;
    const excerpt = excerptAround(text, offset, 4, 30);
    expect(excerpt.phrase).toBe("this");
    expect(excerpt.before.startsWith("…w")).toBe(true);
    expect(excerpt.after.endsWith("…")).toBe(true);
    expect(excerpt.before.length + excerpt.after.length).toBeLessThan(80);
  });
});
