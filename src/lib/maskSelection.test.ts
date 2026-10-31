import { describe, expect, it } from "vitest";
import type { ObjectTrack, PixelBox } from "../meta/sam";
import { handContactFraction, motionScore, selectReferent, type SelectionInput } from "./maskSelection";

const FRAME = { width: 1280, height: 720 };

function box(left: number, top: number, right: number, bottom: number): PixelBox {
  return { left, top, right, bottom };
}

// A track whose box is the same in every frame (a still object).
function stillTrack(concept: string, objectId: string, trackBox: PixelBox, frames = 30, confidence = 0.9): ObjectTrack {
  return {
    concept,
    objectId,
    boxes: Array.from({ length: frames }, (_, frameIndex) => ({ frameIndex, box: trackBox, confidence, mask: null })),
  };
}

// A track that slides `dx` pixels to the right over the clip.
function movingTrack(concept: string, objectId: string, startBox: PixelBox, dx: number, frames = 30): ObjectTrack {
  return {
    concept,
    objectId,
    boxes: Array.from({ length: frames }, (_, frameIndex) => {
      const shift = (dx * frameIndex) / (frames - 1);
      return {
        frameIndex,
        box: box(startBox.left + shift, startBox.top, startBox.right + shift, startBox.bottom),
        confidence: 0.9,
        mask: null,
      };
    }),
  };
}

function baseInput(overrides: Partial<SelectionInput>): SelectionInput {
  return {
    specificTracks: [],
    headNounTracks: [],
    handTracks: [],
    bestFrameIndex: 15,
    frameSize: FRAME,
    kind: "object",
    ...overrides,
  };
}

describe("selectReferent", () => {
  // The M0 spike failure, "Keep that jar right there": a small background jar
  // touches the hand; the walnut jar (the one meant) is not held. SAM matched
  // only the walnut jar for Spark's specific phrase.
  it("prefers the specific-phrase match over a hand-touching head-noun match", () => {
    const hand = stillTrack("hand", "h", box(150, 120, 290, 270));
    const backgroundJar = stillTrack("jar", "0", box(125, 80, 165, 150)); // touches the hand
    const walnutJarAsJar = stillTrack("jar", "1", box(883, 290, 1142, 699));
    const walnutJarSpecific = stillTrack("glass jar of walnuts", "0", box(883, 290, 1142, 699), 30, 0.75);

    const result = selectReferent(baseInput({
      specificTracks: [walnutJarSpecific],
      headNounTracks: [backgroundJar, walnutJarAsJar],
      handTracks: [hand],
    }));

    expect(result.usedSpecificPhrase).toBe(true);
    expect(result.chosen?.track.concept).toBe("glass jar of walnuts");
    expect(result.chosen?.reasons[0]).toBe('matches "glass jar of walnuts"');
    // The head-noun duplicate of the walnut jar is merged, and the background
    // jar is excluded by the tier rule, so there's no runner-up.
    expect(result.ranked).toHaveLength(1);
  });

  it("falls back to head-noun matches when the specific phrase found nothing", () => {
    const result = selectReferent(baseInput({
      specificTracks: [],
      headNounTracks: [stillTrack("jar", "0", box(600, 300, 700, 400))],
    }));
    expect(result.usedSpecificPhrase).toBe(false);
    expect(result.chosen?.track.objectId).toBe("0");
  });

  it("picks the held object over a more central one that nobody touches", () => {
    const hand = stillTrack("hand", "h", box(200, 450, 330, 600));
    const heldSpoon = stillTrack("spoon", "0", box(300, 480, 380, 520)); // off-centre, in the hand
    const centralSpoon = stillTrack("spoon", "1", box(600, 330, 680, 390));

    const result = selectReferent(baseInput({ headNounTracks: [centralSpoon, heldSpoon], handTracks: [hand] }));
    expect(result.chosen?.track.objectId).toBe("0");
    expect(result.chosen?.reasons).toContain("touches a hand in 100% of frames");
  });

  it("uses motion to separate objects when no hand is involved", () => {
    const stillBowl = stillTrack("bowl", "0", box(560, 300, 720, 420));
    const movingBowl = movingTrack("bowl", "1", box(200, 300, 360, 420), 150);

    const result = selectReferent(baseInput({ headNounTracks: [stillBowl, movingBowl] }));
    expect(result.chosen?.track.objectId).toBe("1");
    expect(result.chosen?.reasons.some((reason) => reason.startsWith("moves during the moment"))).toBe(true);
  });

  it("gives hand contact less weight for a location, so a central surface can win", () => {
    const hand = stillTrack("hand", "h", box(50, 500, 150, 600));
    const counterNearHand = stillTrack("counter", "0", box(100, 560, 300, 620));
    const counterCentre = stillTrack("counter", "1", box(240, 260, 1040, 600)); // large, central
    const tracks = { headNounTracks: [counterNearHand, counterCentre], handTracks: [hand] };

    const asObject = selectReferent(baseInput({ ...tracks, kind: "object" }));
    const asLocation = selectReferent(baseInput({ ...tracks, kind: "location" }));
    expect(asObject.chosen?.track.objectId).toBe("0");
    expect(asLocation.chosen?.track.objectId).toBe("1");
  });

  it("uses the nearest visible frame when the object is hidden at the best frame", () => {
    const partial: ObjectTrack = {
      concept: "spatula",
      objectId: "0",
      boxes: [{ frameIndex: 20, box: box(500, 300, 560, 420), confidence: 0.8, mask: null }],
    };
    const result = selectReferent(baseInput({ headNounTracks: [partial], bestFrameIndex: 15 }));
    expect(result.chosen?.boxAtBestFrame.frameIndex).toBe(20);
  });

  it("returns no choice when SAM found nothing", () => {
    const result = selectReferent(baseInput({}));
    expect(result.chosen).toBeNull();
    expect(result.selectionMargin).toBe(0);
  });

  it("reports the margin between the winner and the runner-up", () => {
    const hand = stillTrack("hand", "h", box(200, 450, 330, 600));
    const held = stillTrack("cup", "0", box(300, 480, 380, 520));
    const other = stillTrack("cup", "1", box(900, 100, 960, 160));
    const result = selectReferent(baseInput({ headNounTracks: [held, other], handTracks: [hand] }));
    expect(result.selectionMargin).toBeCloseTo(result.ranked[0]!.score - result.ranked[1]!.score);
    expect(result.selectionMargin).toBeGreaterThan(0.5);
  });
});

describe("track features", () => {
  it("counts hand contact frame by frame", () => {
    const hand: ObjectTrack = {
      concept: "hand",
      objectId: "h",
      boxes: [0, 1].map((frameIndex) => ({ frameIndex, box: box(0, 0, 100, 100), confidence: 0.9, mask: null })),
    };
    const object = stillTrack("cup", "0", box(90, 90, 150, 150), 4); // frames 0-3; hand only in 0-1
    expect(handContactFraction(object, [hand], FRAME)).toBe(0.5);
  });

  it("scores a still object as not moving and a big slide as full motion", () => {
    expect(motionScore(stillTrack("cup", "0", box(0, 0, 50, 50)), FRAME)).toBe(0);
    expect(motionScore(movingTrack("cup", "0", box(0, 0, 50, 50), 200), FRAME)).toBe(1);
  });
});
