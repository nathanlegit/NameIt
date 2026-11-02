// Browser text-to-speech (Web Speech API) for description cues.
//
// speak() returns a cancel function. Cancelling never calls onDone: browsers
// fire "end" or "error" on a cancelled utterance, and the player must not
// treat that as "finished, resume the video".

import { speechDurationSec } from "../lib/placement";

export interface SpeechHandle {
  cancel: () => void;
}

let chosenVoice: SpeechSynthesisVoice | null = null;

// Prefer a natural-sounding English voice when one is installed.
const PREFERRED_VOICES = ["Samantha", "Daniel", "Karen", "Google UK English Female", "Google US English", "Microsoft Aria", "Microsoft Libby"];

function pickVoice(): SpeechSynthesisVoice | null {
  if (chosenVoice) return chosenVoice;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null; // not loaded yet (Safari, Chrome load them async)
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  chosenVoice =
    PREFERRED_VOICES.map((name) => english.find((voice) => voice.name.startsWith(name))).find(Boolean) ??
    english.find((voice) => voice.localService) ??
    english[0] ??
    null;
  return chosenVoice;
}

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function warmUpVoices(): void {
  if (!speechAvailable()) return;
  pickVoice();
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    chosenVoice = null;
    pickVoice();
  });
}

export function speak(text: string, rate: number, onDone: () => void): SpeechHandle {
  if (!speechAvailable()) {
    // No speech: let the caller carry on as if it had been spoken.
    const timer = window.setTimeout(onDone, 0);
    return { cancel: () => window.clearTimeout(timer) };
  }
  let cancelled = false;
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-GB";
  utterance.rate = rate;
  const finish = () => {
    if (!cancelled) {
      cancelled = true;
      onDone();
    }
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.cancel(); // never queue behind an old cue
  window.speechSynthesis.speak(utterance);
  return {
    cancel: () => {
      cancelled = true;
      window.speechSynthesis.cancel();
    },
  };
}

// ---------------------------------------------------------------------------
// F11b: pre-rendered ElevenLabs audio, played through one shared <audio>.
// Safari only lets a page play audio it started from a user gesture, so the
// first Play press "unlocks" this element (playing a silent clip) and every
// cue afterwards reuses it.
// ---------------------------------------------------------------------------

const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
let sharedAudio: HTMLAudioElement | null = null;

function audioElement(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
  }
  return sharedAudio;
}

// Call from a click or key handler (the Play button).
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  const audio = audioElement();
  if (audio.dataset.unlocked) return;
  audio.dataset.unlocked = "true";
  audio.src = SILENT_WAV;
  audio.play().catch(() => {});
}

// Plays the recorded description if there is one, otherwise speaks it with the
// browser voice. A recording that fails to load falls back to the browser voice too.
export function speakCue(text: string, audioUrl: string | null, rate: number, onDone: () => void): SpeechHandle {
  if (!audioUrl) return speak(text, rate, onDone);

  const audio = audioElement();
  let finished = false;
  let fallback: SpeechHandle | null = null;
  const cleanUp = () => {
    audio.onended = null;
    audio.onerror = null;
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    cleanUp();
    onDone();
  };
  const useBrowserVoice = () => {
    if (finished) return;
    cleanUp();
    fallback = speak(text, rate, finish);
  };

  audio.onended = finish;
  audio.onerror = useBrowserVoice;
  audio.dataset.cueText = text; // for debugging and the browser checks
  audio.src = audioUrl;
  audio.playbackRate = rate;
  audio.preservesPitch = true;
  audio.play().catch(useBrowserVoice);

  return {
    cancel: () => {
      finished = true;
      cleanUp();
      audio.pause();
      fallback?.cancel();
    },
  };
}

// Silent stand-in when the built-in voice is off (screen reader users): wait
// roughly as long as the words would take, so extended pauses still happen.
export function waitForReading(text: string, rate: number, onDone: () => void): SpeechHandle {
  const timer = window.setTimeout(onDone, speechDurationSec(text, rate) * 1000 + 400);
  return { cancel: () => window.clearTimeout(timer) };
}
