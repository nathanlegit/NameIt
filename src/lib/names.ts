// F7 helpers: do two names refer to the same thing, and does a name match the glossary?
//
// Deliberately simple word overlap, not embeddings or another model call:
// "the glass jar of walnuts" and "the walnuts" share "walnut", so they agree;
// "the flour" and "the sugar" share nothing, so they don't. Easy to test,
// easy to explain in the review UI.

import type { GlossaryEntry } from "../types";

const STOP_WORDS = new Set([
  "a", "an", "the", "of", "some", "and", "with", "in", "on", "into", "onto", "to", "from",
  "its", "it", "this", "that", "these", "those", "their", "his", "her", "one",
]);

// Naive singular form, good enough to match "walnuts" with "walnut".
function singular(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("sses")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

export function contentWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word))
    .map(singular);
  return [...new Set(words)];
}

// 0 to 1: shared content words divided by the shorter name's word count.
// Dividing by the shorter one means a more specific version of the same name
// still agrees fully ("the walnuts" vs "the glass jar of walnuts" = 1).
export function nameAgreement(first: string | null, second: string | null): number {
  if (!first || !second) return 0;
  const firstWords = contentWords(first);
  const secondWords = new Set(contentWords(second));
  const shorter = Math.min(firstWords.length, secondWords.size);
  if (shorter === 0) return 0;
  const shared = firstWords.filter((word) => secondWords.has(word)).length;
  return shared / shorter;
}

// The glossary entry a resolution uses, if any: every content word of the
// entry's name (or of one alias) appears in the resolved text, or Spark named
// the entry itself in usedGlossaryEntry. Longest match wins ("pepper seedling"
// beats "seedling").
export function findGlossaryMatch(
  resolvedText: string | null,
  usedGlossaryEntry: string | null,
  glossary: GlossaryEntry[],
): GlossaryEntry | null {
  const resolvedWords = new Set(contentWords(resolvedText ?? ""));
  const usedWords = contentWords(usedGlossaryEntry ?? "").join(" ");

  let best: GlossaryEntry | null = null;
  let bestLength = 0;
  for (const entry of glossary) {
    for (const name of [entry.name, ...entry.aliases]) {
      const nameWords = contentWords(name);
      if (nameWords.length === 0) continue;
      const containedInText = nameWords.every((word) => resolvedWords.has(word));
      const namedBySpark = usedWords.length > 0 && nameWords.join(" ") === usedWords;
      if ((containedInText || namedBySpark) && nameWords.length > bestLength) {
        best = entry;
        bestLength = nameWords.length;
      }
    }
  }
  return best;
}
