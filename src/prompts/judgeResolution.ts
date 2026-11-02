// Eval judge (PRD 13.2): is a resolution right, given the human label?
//
// Text only: the judge compares the system's words with the label's words.
// It is Spark judging Spark's output (Name It) and Spark's output (baseline)
// alike, so any bias applies to both columns. Nathan spot-checks verdicts and
// can override them in src/eval/overrides.json.

import { z } from "zod";

export const JudgeResolutionSchema = z.strictObject({
  verdict: z.enum(["correct", "wrong"]),
  reason: z.string(),
});

export type JudgeResolutionOutput = z.infer<typeof JudgeResolutionSchema>;

export interface JudgeResolutionInput {
  sentence: string;
  phrase: string;
  trueReferent: string;
  acceptableAlternatives: string[];
  prediction: string;
}

export function buildJudgeResolutionPrompt(input: JudgeResolutionInput): string {
  const alternatives = input.acceptableAlternatives.length > 0 ? input.acceptableAlternatives.map((text) => `"${text}"`).join(", ") : "(none)";
  return `You are grading an audio description system for blind viewers of how-to videos.
The presenter says: "${input.sentence}"
A human watched the video and labelled what "${input.phrase}" refers to: "${input.trueReferent}".
Also acceptable: ${alternatives}

The system's description: "${input.prediction}"

Verdict "correct" if the description identifies the same thing (or state, place or action) as the label, so a blind viewer would understand what "${input.phrase}" means. Extra accurate detail is fine. Small wording differences are fine.
Verdict "wrong" if it names a different object, a wrong amount, a wrong place or a different action, or if it is too vague to tell what is meant ("an object", "something white").

Reply with JSON: { "verdict": "correct"|"wrong", "reason": string }`;
}
