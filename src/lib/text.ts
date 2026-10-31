// Transcript clean-up.

// Muse Voice Transcribe sometimes stutters a word ("This This part",
// "Honestly honestly", "want it to to look"), even on clean TTS audio.
// A stuttered "this this" would become two references for one moment, so we
// collapse immediate repeats of the same word before detection.
//
// Trade-off: a genuine double like "I know that that is wrong" also collapses
// to one "that". The surviving "that" is still detected, so nothing is lost
// for Name It's purposes.
export function collapseRepeatedWords(text: string): string {
  // \b(\w+)  = a word; (?:\s+\1\b)+ = one or more repeats of that same word.
  // The "i" flag makes "This this" count as a repeat; we keep the first spelling.
  return text.replace(/\b(\w+)(?:\s+\1\b)+/gi, "$1");
}
