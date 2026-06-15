import { describe, expect, it } from "vitest";
import type { ChordSet } from "../../shared/types";
import { buildRemedialSet, candidateSetsForCurrentPractice, decideNext, remedialId } from "./adaptive";

const sets: ChordSet[] = [
  { id: 1, layout: "EN", title: "Level 1", difficulty: 1, tier: "beginner", chords: ["th"] },
  { id: 2, layout: "EN", title: "Level 2", difficulty: 2, tier: "beginner", chords: ["er"] },
  { id: 3, layout: "EN", title: "Level 3", difficulty: 3, tier: "confident", chords: ["ing"] },
  { id: 4, layout: "EN", title: "Level 4", difficulty: 4, tier: "middle", chords: ["tion"] },
];

const baseParams = {
  layoutId: "EN" as const,
  accuracy: 0.9,
  speedCpm: 0,
  cadence: 1,
  perChar: {},
  currentSet: sets[0],
  sets,
  remedialTitle: "Focus",
};

describe("keyboard adaptive level selection", () => {
  it("promotes one level when speed is fast and cadence is stable", () => {
    const decision = decideNext({
      ...baseParams,
      speedCpm: 200,
      cadence: 0.66,
    });

    expect(decision.kind).toBe("up");
    expect(decision.set.id).toBe(2);
  });

  it("suggests the hardest level when speed is above 250 and cadence is stable", () => {
    const decision = decideNext({
      ...baseParams,
      speedCpm: 251,
      cadence: 0.8,
    });

    expect(decision.kind).toBe("up");
    expect(decision.set.id).toBe(4);
  });

  it("limits calibration promotion to the next level even after a very fast first lesson", () => {
    const decision = decideNext({
      ...baseParams,
      speedCpm: 320,
      cadence: 0.9,
      calibrationComplete: false,
    });

    expect(decision.kind).toBe("up");
    expect(decision.set.id).toBe(2);
  });

  it("does not speed-promote when cadence is unstable", () => {
    const decision = decideNext({
      ...baseParams,
      speedCpm: 251,
      cadence: 0.65,
    });

    expect(decision.kind).toBe("repeat");
    expect(decision.set.id).toBe(1);
  });

  it("keeps focus remediation ahead of speed promotion when accuracy is low", () => {
    const decision = decideNext({
      ...baseParams,
      accuracy: 0.8,
      speedCpm: 251,
      cadence: 0.8,
      perChar: { t: 3 },
    });

    expect(decision.kind).toBe("down");
    expect(decision.set.id).toBe(remedialId);
  });

  it("builds remedial focus sets deterministically from the same problem keys and seed", () => {
    const first = buildRemedialSet("EN", ["t", "h", "e"], "Focus", "profile-a:session-4");
    const second = buildRemedialSet("EN", ["t", "h", "e"], "Focus", "profile-a:session-4");
    const otherSeed = buildRemedialSet("EN", ["t", "h", "e"], "Focus", "profile-b:session-4");

    expect(first.chords).toEqual(second.chords);
    expect(first.chords).not.toEqual(otherSeed.chords);
    expect(first.chords).toHaveLength(32);
    expect(first.chords).toContain("th");
  });

  it("mixes remedial problem keys with nearby source-set candidates", () => {
    const decision = decideNext({
      ...baseParams,
      accuracy: 0.8,
      perChar: { t: 3 },
      currentSet: {
        id: 9,
        layout: "EN",
        title: "Source",
        difficulty: 3,
        tier: "confident",
        chords: ["th", "st", "tr", "ta", "re", "ou", "ng", "er", "ti"],
      },
    });

    expect(decision.set.chords).toHaveLength(32);
    expect(decision.set.chords.some((chord) => ["th", "st", "tr", "ta", "ti"].includes(chord))).toBe(true);
  });

  it("keeps natural-language lessons out of programming practice sets", () => {
    const mixedSets: ChordSet[] = [
      ...sets,
      { id: 13, layout: "EN", title: "CODE · Python · Trigrams", difficulty: 7, tier: "professional", practiceKind: "CODE", chords: ["def"] },
      { id: 31, layout: "EN", title: "CODE · Python · Long", difficulty: 9, tier: "professional", practiceKind: "CODE", chords: ["return"] },
      { id: 5, layout: "RU", title: "RU 1", difficulty: 1, tier: "beginner", chords: ["ст"] },
    ];

    expect(candidateSetsForCurrentPractice(sets[0], mixedSets).map((set) => set.id)).toEqual([1, 2, 3, 4]);
  });

  it("keeps programming combinations inside programming practice sets", () => {
    const codeCombo: ChordSet = {
      id: -2,
      sourceChordSetId: 40,
      layout: "EN",
      title: "CODE · TypeScript + Kotlin · Trigrams",
      difficulty: 7,
      tier: "professional",
      practiceKind: "CODE_COMBO",
      chords: ["fun"],
    };
    const mixedSets: ChordSet[] = [
      ...sets,
      { id: 13, layout: "EN", title: "CODE · Python · Trigrams", difficulty: 7, tier: "professional", practiceKind: "CODE", chords: ["def"] },
      { id: 40, layout: "EN", title: "CODE · Mixed · Trigrams", difficulty: 7, tier: "professional", practiceKind: "CODE", chords: ["val"] },
    ];

    expect(candidateSetsForCurrentPractice(codeCombo, mixedSets).map((set) => set.id)).toEqual([13, 40]);
  });
});
