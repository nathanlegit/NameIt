// F11b: pre-rendered description audio, found by the text it speaks.
//
// scripts/render-cue-audio.ts names each MP3 after cueAudioKey(text), and the
// player looks the same key up. So an edited description simply has no file
// yet and falls back to the browser voice, instead of playing stale audio.
// FNV-1a: tiny, deterministic, and the same in Node and the browser.

export function normaliseCueText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function cueAudioKey(text: string): string {
  let hash = 0x811c9dc5;
  for (const character of normaliseCueText(text)) {
    hash ^= character.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
