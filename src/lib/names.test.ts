import { describe, expect, it } from "vitest";
import { contentWords, findGlossaryMatch, nameAgreement } from "./names";
import type { GlossaryEntry } from "../types";

function entry(name: string, aliases: string[] = [], kind: GlossaryEntry["kind"] = "ingredient"): GlossaryEntry {
  return { name, aliases, kind, firstSeenSec: 0, mentionedInSpeech: true };
}

describe("contentWords", () => {
  it("drops articles and punctuation and makes plurals singular", () => {
    expect(contentWords("The two cups of flour.")).toEqual(["two", "cup", "flour"]);
    expect(contentWords("berries")).toEqual(["berry"]);
    expect(contentWords("glasses")).toEqual(["glass"]);
  });
});

describe("nameAgreement", () => {
  it("is 1 when one name is a more specific version of the other", () => {
    expect(nameAgreement("the walnuts", "the glass jar of walnuts")).toBe(1);
  });

  it("is 0 for different things", () => {
    expect(nameAgreement("the flour", "the sugar")).toBe(0);
  });

  it("is partial when some words are shared", () => {
    expect(nameAgreement("the small glass bowl", "the large glass jar")).toBeCloseTo(1 / 3);
  });

  it("is 0 when either answer is missing", () => {
    expect(nameAgreement(null, "the flour")).toBe(0);
    expect(nameAgreement("the", "the flour")).toBe(0);
  });
});

describe("findGlossaryMatch", () => {
  const glossary = [entry("seedling", [], "other"), entry("pepper seedling", ["pepper plant"], "other"), entry("weed membrane", ["fabric"], "material")];

  it("prefers the longest matching name", () => {
    expect(findGlossaryMatch("the pepper seedlings", null, glossary)?.name).toBe("pepper seedling");
  });

  it("matches an alias", () => {
    expect(findGlossaryMatch("a hole in the black fabric", null, glossary)?.name).toBe("weed membrane");
  });

  it("accepts the entry Spark says it used", () => {
    expect(findGlossaryMatch("the plant", "Weed membrane", glossary)?.name).toBe("weed membrane");
  });

  it("returns null when nothing matches", () => {
    expect(findGlossaryMatch("a trowel", null, glossary)).toBeNull();
  });
});
