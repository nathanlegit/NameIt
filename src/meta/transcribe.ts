// Adapter for Muse Voice Transcribe (batch file transcription).
// Verified 30 Oct 2026 against:
//   https://dev.meta.ai/docs/api-reference/voice/transcribe
//   https://dev.meta.ai/docs/api-reference/voice/schemas
//   cookbook 07_sam/03_headlocked_speech_bubble_captions/scripts/transcribe.py
//
// Request: multipart/form-data with two parts:
//   "request" = JSON settings, "audio" = the WAV file.
// Limits: 10 minutes of audio, 32 MB per request.
// Audio: mono 16-bit PCM WAV at 16 kHz or 24 kHz.
// Timing: turn-level only (startMs/endMs). There are no word timestamps,
// which is why F4 estimates the word's time from its position in the turn.

import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Turn } from "../types";
import { getBaseUrl, requireApiKey } from "./client";

const TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";

const TranscribeTurnSchema = z.object({
  turnId: z.number(),
  startMs: z.number(),
  endMs: z.number(),
  transcript: z.string(),
  speaker: z.string().optional(), // only present in DIARIZATION mode
});

export const TranscribeResponseSchema = z.object({
  sessionId: z.string(),
  transcript: z.string(),
  audioDurationMs: z.number(),
  turns: z.array(TranscribeTurnSchema),
});

export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

// DIARIZATION: turns split on speaker changes, with speaker labels.
// ENDPOINTING: turns split on pauses, no speaker labels.
export type TranscribeMode = "DIARIZATION" | "ENDPOINTING";

export interface TranscribeOptions {
  keywords?: string[]; // biasing terms, e.g. ["whisk", "ramekin"]. Not a guarantee of spelling.
  mode?: TranscribeMode; // default DIARIZATION
}

export async function transcribeWav(
  wavPath: string,
  options: TranscribeOptions = {},
): Promise<TranscribeResponse> {
  // The API's own default mode (PUSH_TO_TALK) returns no turns at all,
  // so we always name a mode explicitly.
  const requestSettings: Record<string, unknown> = {
    model: TRANSCRIBE_MODEL,
    audioEncoding: "WAV",
    mode: options.mode ?? "DIARIZATION",
  };
  if (options.keywords && options.keywords.length > 0) {
    requestSettings.keywords = options.keywords;
  }

  const audioBytes = await readFile(wavPath);
  const form = new FormData();
  form.append(
    "request",
    new Blob([JSON.stringify(requestSettings)], { type: "application/json" }),
  );
  form.append("audio", new Blob([audioBytes], { type: "audio/wav" }), "audio.wav");

  const response = await fetch(`${getBaseUrl()}/asr/transcribe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      Accept: "application/json",
    },
    body: form,
  });

  if (!response.ok) {
    const errorBody = (await response.text()).slice(0, 500);
    throw new Error(`Muse Voice Transcribe returned HTTP ${response.status}: ${errorBody}`);
  }

  const json: unknown = await response.json();
  return TranscribeResponseSchema.parse(json);
}

// Converts the API's millisecond turns into our own Turn shape (seconds).
export function toTurns(response: TranscribeResponse): Turn[] {
  return response.turns.map((apiTurn) => ({
    id: `t${apiTurn.turnId}`,
    speaker: apiTurn.speaker ?? "unknown",
    start: apiTurn.startMs / 1000,
    end: apiTurn.endMs / 1000,
    text: apiTurn.transcript,
  }));
}
