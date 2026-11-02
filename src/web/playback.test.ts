import { describe, expect, it } from "vitest";
import { cuesCrossed, nextSpeechStart, playableCues, stepRate, type PlayableCue } from "./playback";
import { approve, currentText, itemStatus, reject, reviewProgress, saveEdit, undoDecision } from "./review";
import { EMPTY_REVIEW, type BundleItem } from "./bundle";
import type { Cue } from "../types";

function cue(overrides: Partial<Cue> = {}): Cue {
  return {
    id: "cue-r", sourceType: "reference", sourceId: "r", start: 5, end: 6, shortText: "Flour.", longText: "A hand tips the flour.",
    delivery: "inline", reviewStatus: "draft", finalText: null, spokenDurationSec: 0.4, placementReason: "", bucket: "ready", ...overrides,
  };
}

function item(referenceId: string, itemCue: Cue | null): BundleItem {
  return {
    referenceId, cueId: `cue-${referenceId}`, phrase: "this", kind: "object",
    sentence: { start: 3, end: 4, text: "Add this.", phraseOffset: 4 }, previousText: null, nextText: null,
    estimatedTime: 3.5, refinedTime: 3.5, evidence: null, rejectedCandidates: [],
    resolution: { resolvedText: "the flour", specificity: "specific", usedGlossaryEntry: null, confidence: 0.9, bucket: itemCue?.bucket ?? "abstain", topCandidates: ["the flour"], secondAnswer: null, uncertaintyNote: null, confidenceNotes: [] },
    cue: itemCue,
  };
}

const now = "2026-11-02T12:00:00.000Z";
const ready = item("a", cue({ id: "cue-a", start: 5 }));
const review = item("b", cue({ id: "cue-b", start: 9, bucket: "needs_review", delivery: "extended" }));
const abstained = item("c", null);

describe("playableCues", () => {
  it("auto mode plays ready drafts; reviewed mode plays nothing until approved", () => {
    expect(playableCues([ready, review, abstained], EMPTY_REVIEW, "auto").map((c) => c.id)).toEqual(["cue-a"]);
    expect(playableCues([ready, review, abstained], EMPTY_REVIEW, "reviewed")).toEqual([]);
  });

  it("plays approved needs_review cues with their delivery text, and never rejected ones", () => {
    let state = approve(EMPTY_REVIEW, review, now);
    state = reject(state, ready, now);
    const cues = playableCues([ready, review], state, "auto");
    expect(cues).toEqual([{ id: "cue-b", referenceId: "b", start: 9, delivery: "extended", text: "A hand tips the flour.", reviewed: true }]);
  });

  it("plays an abstention a reviewer filled in, as an extended cue after its sentence", () => {
    const state = saveEdit(EMPTY_REVIEW, abstained, "The sugar bowl.", now);
    expect(playableCues([abstained], state, "reviewed")).toEqual([
      { id: "cue-c", referenceId: "c", start: 4, delivery: "extended", text: "The sugar bowl.", reviewed: true },
    ]);
  });
});

describe("cuesCrossed", () => {
  const cues: PlayableCue[] = [
    { id: "x", referenceId: "x", start: 5, delivery: "inline", text: "x", reviewed: true },
    { id: "y", referenceId: "y", start: 5.5, delivery: "inline", text: "y", reviewed: true },
  ];

  it("fires cues passed during normal playback, including one exactly at the new time", () => {
    expect(cuesCrossed(cues, 4.98, 5.0).map((c) => c.id)).toEqual(["x"]);
    expect(cuesCrossed(cues, 5.0, 5.02)).toEqual([]);
  });

  it("fires nothing on a seek or when time goes backwards", () => {
    expect(cuesCrossed(cues, 1, 6)).toEqual([]);
    expect(cuesCrossed(cues, 6, 5.2)).toEqual([]);
  });
});

describe("nextSpeechStart", () => {
  it("finds the next turn with words", () => {
    const turns = [{ start: 1, text: "a" }, { start: 6, text: "  " }, { start: 8, text: "b" }];
    expect(nextSpeechStart(turns, 2)).toBe(8);
    expect(nextSpeechStart(turns, 9)).toBeNull();
  });
});

describe("stepRate", () => {
  it("moves in 0.1 steps between 0.8 and 2.0", () => {
    expect(stepRate(1, 1)).toBe(1.1);
    expect(stepRate(0.8, -1)).toBe(0.8);
    expect(stepRate(2, 1)).toBe(2);
  });
});

describe("review actions", () => {
  it("approving keeps the draft text and counts as unchanged", () => {
    const state = approve(EMPTY_REVIEW, ready, now);
    expect(itemStatus(ready, state)).toBe("approved");
    expect(state.decisions.a?.finalText).toBe("Flour.");
    expect(state.edits).toEqual([]);
  });

  it("editing logs before and after, and approving afterwards keeps it 'edited'", () => {
    let state = saveEdit(EMPTY_REVIEW, ready, "Two cups of flour.", now);
    expect(state.edits).toEqual([{ cueId: "cue-a", before: "Flour.", after: "Two cups of flour.", at: now }]);
    state = approve(state, ready, now);
    expect(itemStatus(ready, state)).toBe("edited");
    expect(currentText(ready, state)).toBe("Two cups of flour.");
  });

  it("saving unchanged text is an approval, not an edit", () => {
    const state = saveEdit(EMPTY_REVIEW, ready, " Flour. ", now);
    expect(itemStatus(ready, state)).toBe("approved");
    expect(state.edits).toEqual([]);
  });

  it("an abstention cannot be approved without text", () => {
    expect(approve(EMPTY_REVIEW, abstained, now)).toBe(EMPTY_REVIEW);
    expect(itemStatus(abstained, EMPTY_REVIEW)).toBe("abstained");
  });

  it("undo returns an item to its draft state, and progress counts decisions", () => {
    let state = reject(EMPTY_REVIEW, ready, now);
    state = approve(state, review, now);
    expect(reviewProgress([ready, review, abstained], state)).toEqual({ total: 3, decided: 2, approvedUnchanged: 1, edited: 0, rejected: 1 });
    state = undoDecision(state, ready);
    expect(itemStatus(ready, state)).toBe("draft");
  });
});
