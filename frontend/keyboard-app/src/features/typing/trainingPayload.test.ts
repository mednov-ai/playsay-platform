import { describe, expect, it } from "vitest";
import type { ChordSet } from "../../shared/types";
import type { SessionResult } from "./typingStore";
import { buildTrainingSubmitPayload } from "./trainingPayload";

const baseResult: SessionResult = {
  clientResultId: "keyboard-test-result",
  chordSetId: -1,
  layoutId: "EN",
  speedCpm: 168.4,
  averageCpm: 168.4,
  accuracy: 0.91,
  errors: 4,
  durationMs: 31_000,
  perFinger: { leftIndex: 4 },
  perChar: { t: 3 },
  perChord: { th: 4 },
  cadence: 0.72,
  characterCount: 220,
  correctCount: 216,
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
      clientResultId: expect.stringMatching(/^keyboard-/),
      chordSetId: 7,
      lessonKind: "FOCUS",
      focusProblemKeys: ["th", "t"],
      perChord: { th: 4 },
      averageCpm: 168.4,
      cadence: 0.72,
      characterCount: 220,
      correctCount: 216,
      clientTimezone: expect.any(String),
      localTrainingDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
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

  it("submits synthetic combined code lessons through their mixed anchor with practice context", () => {
    const comboSet: ChordSet = {
      id: -2,
      sourceChordSetId: 40,
      layout: "EN",
      title: "CODE · TypeScript + Kotlin · Trigrams",
      difficulty: 7,
      tier: "professional",
      practiceKind: "CODE_COMBO",
      codeLanguages: ["typescript", "kotlin"],
      practiceContext: {
        practiceKind: "CODE_COMBO",
        codeLanguages: ["typescript", "kotlin"],
        difficultyBand: "trigrams",
        title: "CODE · TypeScript + Kotlin · Trigrams",
      },
      chords: ["fun", "ype", "():", "val"],
    };

    expect(buildTrainingSubmitPayload(baseResult, comboSet)).toMatchObject({
      chordSetId: 40,
      lessonKind: "STANDARD",
      practiceContext: {
        practiceKind: "CODE_COMBO",
        codeLanguages: ["typescript", "kotlin"],
        difficultyBand: "trigrams",
        title: "CODE · TypeScript + Kotlin · Trigrams",
      },
    });
  });

  it("attributes whole-word and n-gram results separately with stable target ids", () => {
    const vocabularySet: ChordSet = {
      id: -900,
      sourceChordSetId: 7,
      layout: "EN",
      title: "Homework",
      difficulty: 1,
      tier: "beginner",
      chords: ["weather", "the"],
      practiceKind: "VOCABULARY",
      practiceContext: { practiceKind: "VOCABULARY", title: "Homework", vocabularySessionId: "session-1" },
      vocabularyContext: {
        sessionId: "session-1", mode: "MIXED", typedTargets: true, startPosition: 0, totalTargets: 2,
        delivery: "HOMEWORK", completionPolicy: "MEANINGFUL_ACTIVITY",
        targets: [
          { targetId: "41111111-1111-4111-a111-111111111111", position: 0, type: "WHOLE_WORD", text: "weather", sourceEntryIds: ["entry-1"], sourceItemIds: ["item-1"], offsets: [] },
          { targetId: "51111111-1111-4111-a111-111111111111", position: 1, type: "CHARACTER_NGRAM", text: "the", sourceEntryIds: ["entry-1"], sourceItemIds: ["item-1"], offsets: [] },
        ],
      },
    };
    const payload = buildTrainingSubmitPayload({ ...baseResult, perChord: { weather: 1, the: 2 } }, vocabularySet);
    expect(payload?.vocabularyResults).toEqual([
      expect.objectContaining({ resultId: "41111111-1111-4111-a111-111111111111", targetType: "WHOLE_WORD", errors: 1 }),
      expect.objectContaining({ resultId: "51111111-1111-4111-a111-111111111111", targetType: "CHARACTER_NGRAM", errors: 2 }),
    ]);
  });
});
