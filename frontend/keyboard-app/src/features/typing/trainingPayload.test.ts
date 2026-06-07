import { describe, expect, it } from "vitest";
import type { ChordSet } from "../../shared/types";
import type { SessionResult } from "./typingStore";
import { buildTrainingSubmitPayload } from "./trainingPayload";

const baseResult: SessionResult = {
  chordSetId: -1,
  speedCpm: 168.4,
  accuracy: 0.91,
  errors: 4,
  durationMs: 31_000,
  perFinger: { leftIndex: 4 },
  perChar: { t: 3 },
  perChord: { th: 4 },
  cadence: 0.72,
};

describe("training submit payload", () => {
  it("submits focus lessons against the positive source chord set id", () => {
    const focusSet: ChordSet = {
      id: -1,
      sourceChordSetId: 7,
      focusProblemKeys: ["th", "t"],
      layout: "EN",
      title: "Focus: th",
      difficulty: 0,
      tier: "beginner",
      chords: ["th", "the", "er"],
    };

    expect(buildTrainingSubmitPayload(baseResult, focusSet)).toMatchObject({
      chordSetId: 7,
      lessonKind: "FOCUS",
      focusProblemKeys: ["th", "t"],
      perChord: { th: 4 },
    });
  });

  it("keeps regular lessons as standard lessons", () => {
    const standardSet: ChordSet = {
      id: 3,
      layout: "EN",
      title: "Level 3",
      difficulty: 3,
      tier: "confident",
      chords: ["ing"],
    };

    expect(buildTrainingSubmitPayload({ ...baseResult, chordSetId: 3 }, standardSet)).toMatchObject({
      chordSetId: 3,
      lessonKind: "STANDARD",
      focusProblemKeys: [],
    });
  });
});
