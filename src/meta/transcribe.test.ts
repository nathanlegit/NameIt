import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/transcribe-endpointing.json";
import { toTurns, TranscribeResponseSchema } from "./transcribe";

// A real ENDPOINTING response for one speech segment of clip1 (31 Oct 2026),
// stutter included: "You want it it to look like this."
describe("Muse Voice Transcribe adapter", () => {
  it("accepts a real API response", () => {
    expect(() => TranscribeResponseSchema.parse(fixture)).not.toThrow();
  });

  it("converts millisecond turns to seconds, with a default speaker", () => {
    const turns = toTurns(TranscribeResponseSchema.parse(fixture));
    expect(turns).toEqual([
      { id: "t0", speaker: "unknown", start: 0, end: 1.1, text: "You want it it to look like this." },
    ]);
  });

  it("rejects a response missing turns", () => {
    const { turns: _turns, ...withoutTurns } = fixture;
    expect(() => TranscribeResponseSchema.parse(withoutTurns)).toThrow();
  });
});
