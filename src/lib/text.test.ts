import { describe, expect, it } from "vitest";
import { collapseRepeatedWords } from "./text";

describe("collapseRepeatedWords", () => {
  // Each of these stutters came back from Muse Voice Transcribe on 31 Oct.
  it.each([
    ["This This part is really easy.", "This part is really easy."],
    ["Honestly honestly that's the secret", "Honestly that's the secret"],
    ["You want it to to look like this", "You want it to look like this"],
    ["Today we are are making pancakes.", "Today we are making pancakes."],
    ["pour about this this much batter", "pour about this much batter"],
  ])("collapses %j", (input, expected) => {
    expect(collapseRepeatedWords(input)).toBe(expected);
  });

  it("collapses three or more repeats", () => {
    expect(collapseRepeatedWords("add the the the flour")).toBe("add the flour");
  });

  it("leaves different words alone", () => {
    expect(collapseRepeatedWords("this one, then that one")).toBe("this one, then that one");
  });

  it("does not collapse across punctuation", () => {
    expect(collapseRepeatedWords("Stir it. It thickens.")).toBe("Stir it. It thickens.");
  });

  it("does not merge a word with a longer word that starts the same way", () => {
    expect(collapseRepeatedWords("the these")).toBe("the these");
  });
});
