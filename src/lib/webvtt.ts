// F9 output: a WebVTT description track (<track kind="descriptions">).
//
// WebVTT is the web's timed-text format: a "WEBVTT" header, then one block per
// cue with an id, "start --> end" and the text. Browsers expose description
// tracks to screen readers, so the file is useful even without our player.
//
// WebVTT has no way to say "pause the video here", so an extended cue gets a
// NOTE line and an end time of start + its speaking time, cut short at the
// next cue so cues never overlap in the file. Our own player (F11) reads the
// cues from bundle.json instead, which carries the delivery mode properly.

import type { Seconds } from "../types";

export interface VttCue {
  id: string;
  start: Seconds;
  end: Seconds;
  text: string;
  extended: boolean;
}

// 75.5 -> "00:01:15.500"
export function formatVttTime(seconds: Seconds): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const pad = (value: number, width: number) => String(value).padStart(width, "0");
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)}.${pad(ms, 3)}`;
}

// Cue text may not contain "-->", and &, < and > must be escaped.
function escapeVttText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\s+/g, " ").trim();
}

export function toWebVtt(cues: VttCue[]): string {
  const sorted = [...cues].sort((first, second) => first.start - second.start);
  const blocks = sorted.map((cue, index) => {
      const nextStart = sorted[index + 1]?.start ?? Infinity;
      const end = Math.max(Math.min(cue.end, nextStart), cue.start + 0.001); // a cue must end after it starts
      const lines = [
        ...(cue.extended ? ["NOTE extended description: pause the video while this is spoken", ""] : []),
        cue.id,
        `${formatVttTime(cue.start)} --> ${formatVttTime(end)}`,
        escapeVttText(cue.text),
      ];
      return lines.join("\n");
    });
  return ["WEBVTT", ...blocks].join("\n\n") + "\n";
}
