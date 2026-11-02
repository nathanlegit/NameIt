// Shared by scripts/export-demo.ts and scripts/render-cue-audio.ts (node only):
// the reviewer's decisions, and which description texts have rendered audio.
// (These lived in the two scripts and imported each other.)

import { existsSync } from "node:fs";
import path from "node:path";
import { readJson } from "../lib/cache";
import { DESCRIBER_VOICE_ID } from "../tts/elevenlabs";
import type { Cue } from "../types";
import { EMPTY_REVIEW, type ReviewState } from "../web/bundle";
import { normaliseCueText } from "../web/cueAudio";
import { videoPaths } from "./store";

export async function readReviewState(videoId: string): Promise<ReviewState> {
  const reviewPath = videoPaths(videoId).review;
  return existsSync(reviewPath) ? readJson<ReviewState>(reviewPath) : EMPTY_REVIEW;
}

export function describerVoiceId(): string {
  return process.env.ELEVENLABS_DESCRIBER_VOICE_ID || DESCRIBER_VOICE_ID;
}

// data/videos/<id>/cue-audio/<voice>/<cueAudioKey(text)>.mp3
export function cueAudioDir(videoId: string): string {
  return path.join(videoPaths(videoId).dir, "cue-audio", describerVoiceId());
}

// Every text the player might speak for this video: each cue's draft (short
// for inline, long for extended) and every reviewer's final text.
export async function speakableTexts(videoId: string): Promise<string[]> {
  const cues = await readJson<Cue[]>(videoPaths(videoId).cues);
  const review = await readReviewState(videoId);
  const texts = [
    ...cues.map((cue) => (cue.delivery === "inline" ? cue.shortText : cue.longText)),
    ...Object.values(review.decisions).map((decision) => decision.finalText ?? ""),
  ];
  return [...new Set(texts.map(normaliseCueText).filter(Boolean))];
}
