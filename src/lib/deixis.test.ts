import { describe, expect, it } from "vitest";
import { findDeicticCandidates, markPhraseInText } from "./deixis";
import type { Turn } from "../types";

function turnWithText(text: string): Turn {
  return { id: "t0", speaker: "presenter", start: 0, end: 4, text };
}

function phrasesIn(text: string): string[] {
  return findDeicticCandidates(turnWithText(text)).map((match) => match.phrase);
}

describe("findDeicticCandidates", () => {
  it("prefers the longer phrase at the same position", () => {
    expect(phrasesIn("Mix until it looks like this.")).toContain("like this");
    expect(phrasesIn("Mix until it looks like this.")).not.toContain("this");
  });

  it("finds every candidate in a sentence, in order", () => {
    expect(phrasesIn("Put that one over here, then these.")).toEqual(["that one", "over here", "these"]);
  });

  it("does not match inside longer words", () => {
    expect(phrasesIn("A thistle and the thesis are there.")).toEqual(["there"]);
  });

  it("matches 'That' at the start of a contraction", () => {
    expect(phrasesIn("That's the dry mix done.")).toEqual(["That"]);
  });

  it("only includes 'it' when the turn has a hands-on verb", () => {
    expect(phrasesIn("Pour it in slowly.")).toEqual(["it"]);
    expect(phrasesIn("I love it so much.")).toEqual([]);
  });

  it("records the character offset of each match", () => {
    const [match] = findDeicticCandidates(turnWithText("Now add this to the bowl"));
    expect(match).toMatchObject({ phrase: "this", charOffset: 8 });
  });
});

describe("markPhraseInText", () => {
  it("wraps the matched phrase in [[ ]]", () => {
    const turn = turnWithText("Whisk until it looks like this.");
    const [match] = findDeicticCandidates(turn).filter((candidate) => candidate.phrase === "like this");
    expect(markPhraseInText(turn.text, match!)).toBe("Whisk until it looks [[like this]].");
  });
});
