// Browser text-to-speech (Web Speech API) for description cues.
//
// speak() returns a cancel function. Cancelling never calls onDone: browsers
// fire "end" or "error" on a cancelled utterance, and the player must not
// treat that as "finished, resume the video".

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

// Silent stand-in when the built-in voice is off (screen reader users): wait
// roughly as long as the words would take, so extended pauses still happen.
export function waitForReading(text: string, rate: number, onDone: () => void): SpeechHandle {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const timer = window.setTimeout(onDone, (words / (2.5 * rate)) * 1000 + 400);
  return { cancel: () => window.clearTimeout(timer) };
}
