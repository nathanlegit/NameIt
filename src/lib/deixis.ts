// F3 stage A: find candidate deictic phrases in a turn's text.
//
// Deixis = words whose meaning depends on the situation ("this", "here").
// This stage is deliberately greedy: it finds every possible candidate, and
// Muse Spark (stage B) decides which ones point at something on screen.
// Recall matters more than precision here, because a missed reference stays
// inaccessible, while a false candidate costs one cheap classifier call.

import type { Turn } from "../types";

export interface DeicticMatch {
  turnId: string;
  phrase: string;     // as written in the transcript, e.g. "like this"
  charOffset: number; // index of the phrase's first character in turn.text
}

// Longer phrases come first so "like this" wins over plain "this" at the same spot.
const DEICTIC_PHRASES = [
  "right here", "over here", "right there", "over there",
  "like this", "like that", "this one", "that one", "this much", "this way",
  "these", "those", "this", "that", "here", "there",
];

// "it" is only a candidate when the turn also has a hands-on verb
// ("pour it in"). Otherwise "it" is almost always anaphoric ("it's easy").
const VISUAL_VERBS = [
  "add", "put", "place", "pour", "hold", "mix", "stir", "whisk", "take", "grab",
  "use", "cut", "chop", "slice", "turn", "tighten", "loosen", "press", "fold",
  "look", "see", "check", "slide", "insert", "attach", "remove", "flip",
  "sprinkle", "spread", "screw", "pull", "push", "drop", "fill", "tip",
];

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const phraseAlternation = DEICTIC_PHRASES.map(escapeForRegex).join("|");
// \b = word boundary, so "this" does not match inside "thistle".
const DEICTIC_REGEX = new RegExp(`\\b(${phraseAlternation})\\b`, "gi");
const IT_REGEX = /\bit\b/gi;
const VISUAL_VERB_REGEX = new RegExp(`\\b(${VISUAL_VERBS.join("|")})(s|ed|ing)?\\b`, "i");

export function findDeicticCandidates(turn: Turn): DeicticMatch[] {
  const matches: DeicticMatch[] = [];

  for (const match of turn.text.matchAll(DEICTIC_REGEX)) {
    matches.push({ turnId: turn.id, phrase: match[0], charOffset: match.index });
  }

  const turnHasVisualVerb = VISUAL_VERB_REGEX.test(turn.text);
  if (turnHasVisualVerb) {
    for (const match of turn.text.matchAll(IT_REGEX)) {
      matches.push({ turnId: turn.id, phrase: match[0], charOffset: match.index });
    }
  }

  return matches.sort((first, second) => first.charOffset - second.charOffset);
}

// Returns the turn text with the phrase wrapped in [[ ]], as the prompts expect:
// "Now add [[this]] to the bowl".
export function markPhraseInText(text: string, match: DeicticMatch): string {
  const before = text.slice(0, match.charOffset);
  const phrase = text.slice(match.charOffset, match.charOffset + match.phrase.length);
  const after = text.slice(match.charOffset + match.phrase.length);
  return `${before}[[${phrase}]]${after}`;
}
