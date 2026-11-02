// F9: where each description cue goes in time. Pure functions, no API calls.
//
// Speech runs at about 2.5 words per second, so a gap of d seconds holds
// floor((d - 0.3) x 2.5) words: 0.15 s lead-in after the presenter stops,
// 0.15 s tail before they start again.
//
// For each cue, in the order the references are spoken:
//   1. Find the nearest gap starting within 3 s before or after the reference,
//      among the gap right before its sentence and the gap right after it.
//      (A gap further away would put the cue after a different sentence:
//      the viewer would hear "a pepper seedling" after "firm it down like this".)
//   2. If the short text fits in what's left of that gap: INLINE, spoken in the gap.
//   3. Otherwise: EXTENDED. The video pauses at the end of the reference's
//      sentence and the long text is spoken.
// Two cues that want the same gap share it in spoken order (the second starts
// after the first ends); if the second no longer fits, it becomes extended.
// Earlier references get first claim, because in a how-to the sequence of
// actions matters most (DCMP).

import type { Gap, Seconds, Turn } from "../types";

export const WORDS_PER_SECOND = 2.5;   // at speechRate 1
export const CUE_LEAD_IN_SEC = 0.15;   // silence after the presenter stops, before a cue
export const CUE_TAIL_SEC = 0.15;      // silence after a cue, before the presenter starts
export const GAP_SEARCH_SEC = 3;
// An extended cue pauses at the end of its sentence, unless the "sentence" is a
// long run of speech with no pause (a presenter who never stops: held-meat had a
// 141 s turn, and 11 descriptions all fired at its end). Then it pauses shortly
// after the word instead, interrupting the presenter, as extended description does.
export const LONG_TURN_SEC = 8;
export const EXTENDED_PAUSE_AFTER_WORD_SEC = 1.5;
const ADJACENT_TOLERANCE_SEC = 0.05; // gap and sentence edges are rounded differently

// Hyphenated parts count separately: TTS speaks "center-hole" as two words.
// (Spark joined words with hyphens to squeeze into a 1-word budget.)
export function wordCount(text: string): number {
  return text.trim().split(/[\s\-–—]+/).filter((word) => /[a-z0-9]/i.test(word)).length;
}

export function speechDurationSec(text: string, speechRate = 1): Seconds {
  return wordCount(text) / (WORDS_PER_SECOND * speechRate);
}

// PRD F9 step 2: budgetWords = floor((gap.duration - 0.3) x wordsPerSecond).
export function budgetWords(gapDurationSec: Seconds, speechRate = 1): number {
  const usable = gapDurationSec - CUE_LEAD_IN_SEC - CUE_TAIL_SEC;
  return Math.max(0, Math.floor(usable * WORDS_PER_SECOND * speechRate + 1e-9));
}

// The sentence a reference is in, as a time span.
export interface SentenceSpan {
  start: Seconds;
  end: Seconds;
}

// The gap whose start is closest to the reference time, within ±3 s, that
// touches the reference's sentence (ends where it starts, or starts where it ends).
// On a tie, the earlier gap wins: describe before the action when possible.
export function findNearestGap(gaps: Gap[], referenceTime: Seconds, sentence: SentenceSpan): Gap | null {
  let nearest: Gap | null = null;
  for (const gap of gaps) {
    const distance = Math.abs(gap.start - referenceTime);
    if (distance > GAP_SEARCH_SEC + 1e-9) continue;
    const rightBefore = Math.abs(gap.end - sentence.start) <= ADJACENT_TOLERANCE_SEC;
    const rightAfter = Math.abs(gap.start - sentence.end) <= ADJACENT_TOLERANCE_SEC;
    if (!rightBefore && !rightAfter) continue;
    if (nearest === null || distance < Math.abs(nearest.start - referenceTime)) nearest = gap;
  }
  return nearest;
}

export interface CueRequest {
  id: string;
  referenceTime: Seconds;  // when the "this" is said
  sentence: SentenceSpan;  // the turn containing it; an extended cue pauses at its end
  shortText: string;
  longText: string;
}

export interface PlacedCue {
  id: string;
  delivery: "inline" | "extended";
  start: Seconds;              // video time the cue starts (extended: the video pauses here)
  end: Seconds;                // inline: video time speech ends; extended: same as start
  text: string;                // what is spoken: short for inline, long for extended
  spokenDurationSec: Seconds;
  gap: Gap | null;             // the gap an inline cue sits in
  reason: string;              // why this delivery, for the review UI
}

function roundToMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// Where an extended cue pauses the video: the end of its sentence, or shortly
// after the word in a very long turn.
export function extendedPauseTime(request: CueRequest): Seconds {
  const { start, end } = request.sentence;
  if (end - start <= LONG_TURN_SEC) return end;
  return Math.min(end, Math.max(start, request.referenceTime + EXTENDED_PAUSE_AFTER_WORD_SEC));
}

export function placeCues(requests: CueRequest[], gaps: Gap[], speechRate = 1): PlacedCue[] {
  // Earliest free time in each gap, keyed by gap start.
  const nextFreeInGap = new Map<number, Seconds>();
  const inOrder = [...requests].sort((first, second) => first.referenceTime - second.referenceTime);
  const placed: PlacedCue[] = [];

  for (const request of inOrder) {
    const gap = findNearestGap(gaps, request.referenceTime, request.sentence);
    const shortDuration = speechDurationSec(request.shortText, speechRate);

    let inlineReason = "no pause next to the sentence";
    if (gap && wordCount(request.shortText) > 0) {
      const start = Math.max(gap.start + CUE_LEAD_IN_SEC, nextFreeInGap.get(gap.start) ?? 0);
      const end = start + shortDuration;
      if (end <= gap.end - CUE_TAIL_SEC + 1e-9) {
        nextFreeInGap.set(gap.start, end + CUE_LEAD_IN_SEC);
        placed.push({
          id: request.id,
          delivery: "inline",
          start: roundToMs(start),
          end: roundToMs(end),
          text: request.shortText,
          spokenDurationSec: roundToMs(shortDuration),
          gap,
          reason: `fits the ${gap.durationSec.toFixed(1)} s gap at ${gap.start.toFixed(1)} s`,
        });
        continue;
      }
      inlineReason = nextFreeInGap.has(gap.start)
        ? `the ${gap.durationSec.toFixed(1)} s gap at ${gap.start.toFixed(1)} s is already used`
        : `${wordCount(request.shortText)} words don't fit the ${gap.durationSec.toFixed(1)} s gap (budget ${budgetWords(gap.durationSec, speechRate)})`;
    }

    const pauseAt = extendedPauseTime(request);
    placed.push({
      id: request.id,
      delivery: "extended",
      start: roundToMs(pauseAt),
      end: roundToMs(pauseAt),
      text: request.longText,
      spokenDurationSec: roundToMs(speechDurationSec(request.longText, speechRate)),
      gap: null,
      reason: pauseAt < request.sentence.end
        ? `${inlineReason}: long run of speech, pause the video just after the word`
        : `${inlineReason}: pause the video after the sentence`,
    });
  }

  return placed.sort((first, second) => first.start - second.start);
}

// ---------------------------------------------------------------------------
// Checks used by the eval and by the cue stage (F9 acceptance).
// ---------------------------------------------------------------------------

// Pairs of cues that would talk over each other. Inline cues are intervals in
// video time; an extended cue is an instant (the video is paused while it speaks),
// so it collides only if it falls strictly inside an inline cue.
export function findOverlaps(cues: PlacedCue[]): Array<[string, string]> {
  const overlaps: Array<[string, string]> = [];
  for (let i = 0; i < cues.length; i++) {
    for (let j = i + 1; j < cues.length; j++) {
      const first = cues[i]!;
      const second = cues[j]!;
      const firstIsInterval = first.delivery === "inline";
      const secondIsInterval = second.delivery === "inline";
      let collide = false;
      if (firstIsInterval && secondIsInterval) collide = first.start < second.end && second.start < first.end;
      else if (firstIsInterval) collide = second.start > first.start && second.start < first.end;
      else if (secondIsInterval) collide = first.start > second.start && first.start < second.end;
      if (collide) overlaps.push([first.id, second.id]);
    }
  }
  return overlaps;
}

// True if an inline cue finishes before the next spoken turn begins.
export function inlineCueFitsSpeech(cue: PlacedCue, turns: Turn[]): boolean {
  const nextTurn = turns
    .filter((turn) => turn.text.trim().length > 0 && turn.start >= cue.start - 1e-9)
    .sort((first, second) => first.start - second.start)[0];
  const speakingDuringCue = turns.some(
    (turn) => turn.text.trim().length > 0 && turn.start < cue.start && turn.end > cue.start,
  );
  return !speakingDuringCue && (nextTurn === undefined || cue.end <= nextTurn.start + 1e-9);
}
