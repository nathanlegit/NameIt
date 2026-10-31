// F2: dialogue gaps, the places where an audio description cue can be spoken.
//
// A gap is any stretch of at least MIN_GAP_SEC with no transcribed speech:
// before the first turn, between turns, and after the last turn.
// Gaps come from turns with words, not from raw silence, so background music
// with no one talking still counts as a gap (a cue may be spoken over music).

import type { Gap, Seconds, Turn } from "../types";

export const MIN_GAP_SEC = 1.0;

export function computeGaps(turns: Turn[], videoDurationSec: Seconds, minGapSec: Seconds = MIN_GAP_SEC): Gap[] {
  const spokenTurns = turns
    .filter((turn) => turn.text.trim().length > 0)
    .sort((first, second) => first.start - second.start);

  const gaps: Gap[] = [];
  let speechEndSoFar = 0; // the latest end time of any turn seen so far

  for (const turn of spokenTurns) {
    if (turn.start - speechEndSoFar >= minGapSec) {
      gaps.push(makeGap(speechEndSoFar, turn.start));
    }
    // Max, not assignment: a turn nested inside a longer one mustn't open a fake gap.
    speechEndSoFar = Math.max(speechEndSoFar, turn.end);
  }

  if (videoDurationSec - speechEndSoFar >= minGapSec) {
    gaps.push(makeGap(speechEndSoFar, videoDurationSec));
  }
  return gaps;
}

function makeGap(start: Seconds, end: Seconds): Gap {
  const roundedStart = roundToMs(start);
  const roundedEnd = roundToMs(end);
  return { start: roundedStart, end: roundedEnd, durationSec: roundToMs(roundedEnd - roundedStart) };
}

function roundToMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}
