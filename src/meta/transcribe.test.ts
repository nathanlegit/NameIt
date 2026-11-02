import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/transcribe-endpointing.json";
import { TranscribeResponseSchema } from "./transcribe";

// A real ENDPOINTING response for one speech segment of clip1 (31 Oct 2026),
// stutter included: "You want it it to look like this."
describe("Muse Voice Transcribe adapter", () => {
  it("accepts a real API response", () => {
    expect(() => TranscribeResponseSchema.parse(fixture)).not.toThrow();
  });

  it("keeps the turn timing in milliseconds and the stuttered text as returned", () => {
    const parsed = TranscribeResponseSchema.parse(fixture);
    expect(parsed.turns.map((turn) => [turn.startMs, turn.endMs, turn.transcript])).toEqual([
      [0, 1100, "You want it it to look like this."],
    ]);
  });

  it("rejects a response missing turns", () => {
    const { turns: _turns, ...withoutTurns } = fixture;
    expect(() => TranscribeResponseSchema.parse(withoutTurns)).toThrow();
  });
});
