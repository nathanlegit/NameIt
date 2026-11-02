// Display helpers for long transcript turns. A narrator who never pauses gives
// turns of 2 minutes or more (held-meat); the UI shows a window around the phrase.

export interface Excerpt {
  before: string;   // text before the phrase (with a leading "…" if cut)
  phrase: string;
  after: string;    // text after the phrase (with a trailing "…" if cut)
}

export function excerptAround(text: string, phraseOffset: number, phraseLength: number, radius = 160): Excerpt {
  const phraseEnd = phraseOffset + phraseLength;
  let start = Math.max(0, phraseOffset - radius);
  let end = Math.min(text.length, phraseEnd + radius);
  // Cut at word boundaries.
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(" ", end) > phraseEnd ? text.lastIndexOf(" ", end) : end;
  return {
    before: `${start > 0 ? "…" : ""}${text.slice(start, phraseOffset)}`,
    phrase: text.slice(phraseOffset, phraseEnd),
    after: `${text.slice(phraseEnd, end)}${end < text.length ? "…" : ""}`,
  };
}
