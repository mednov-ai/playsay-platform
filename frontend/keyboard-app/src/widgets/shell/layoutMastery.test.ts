import { describe, expect, it } from "vitest";
import type { GamificationProfile, Progress } from "../../shared/types";
import type { StreamItem } from "../../features/typing/typingStore";
import { activeLayoutGamification, countCompletedChords, displayedMasteryCpm, layoutMasteryCpm } from "./KeyboardTrainerShell";

const gamification: GamificationProfile = {
  calibrated: true,
  calibrationSessions: 3,
  calibrationTarget: 3,
  masteryCpm: 260,
  baselineMasteryCpm: 240,
  leagueLevel: 3,
  leagueProgress: 12,
  currentStreak: 4,
  bestStreak: 5,
  streakFreezes: 1,
  trend: [240, 260],
  achievements: ["METRONOME"],
  layoutMastery: {
    EN: {
      layout: "EN",
      calibrated: true,
      calibrationSessions: 3,
      calibrationTarget: 3,
      masteryCpm: 260,
      baselineMasteryCpm: 240,
      leagueLevel: 3,
      leagueProgress: 12,
      trend: [240, 260],
    },
    RU: {
      layout: "RU",
      calibrated: false,
      calibrationSessions: 1,
      calibrationTarget: 3,
      masteryCpm: 90,
      leagueLevel: 0,
      leagueProgress: 90,
      trend: [90],
    },
  },
};

describe("layout mastery display", () => {
  it("switches the displayed mastery profile with the active layout", () => {
    expect(activeLayoutGamification(gamification, "EN")?.masteryCpm).toBe(260);
    expect(activeLayoutGamification(gamification, "EN")?.leagueLevel).toBe(3);
    expect(activeLayoutGamification(gamification, "RU")?.masteryCpm).toBe(90);
    expect(activeLayoutGamification(gamification, "RU")?.leagueLevel).toBe(0);
  });

  it("prefers backend layout mastery over local guest fallback", () => {
    const progress: Progress = {
      sessions: 2,
      bestSpeedCpm: 260,
      avgSpeedCpm: 175,
      avgAccuracy: 0.96,
      weakFingers: [],
      recent: [],
      gamification,
    };

    expect(layoutMasteryCpm(progress, { RU: { masteryCpm: 120 } }, "RU")).toBe(90);
    expect(layoutMasteryCpm(null, { RU: { masteryCpm: 120 } }, "RU")).toBe(120);
  });

  it("counts completed non-space chord indexes, not raw characters", () => {
    const stream: StreamItem[] = [
      item("a", 0, "ab"),
      item("b", 0, "ab"),
      space(1),
      item("c", 1, "cd"),
      item("d", 1, "cd"),
      space(2),
      item("e", 2, "ef"),
      item("f", 2, "ef"),
    ];

    expect(countCompletedChords(stream, 1)).toBe(0);
    expect(countCompletedChords(stream, 2)).toBe(1);
    expect(countCompletedChords(stream, 8)).toBe(3);
  });

  it("uses placeholder before three chords and provisional mastery after the bootstrap threshold", () => {
    expect(
      displayedMasteryCpm({
        liveSpeedCpm: 240,
        liveAccuracy: 1,
        liveCadence: 1,
        completedChordCount: 2,
      }),
    ).toBeNull();
    expect(
      displayedMasteryCpm({
        liveSpeedCpm: 240,
        liveAccuracy: 1,
        liveCadence: 1,
        completedChordCount: 3,
      }),
    ).toBe(240);
  });

  it("prefers saved and session mastery over provisional live mastery", () => {
    expect(
      displayedMasteryCpm({
        savedLayoutMasteryCpm: 180,
        liveSpeedCpm: 240,
        liveAccuracy: 1,
        liveCadence: 1,
        completedChordCount: 3,
      }),
    ).toBe(180);
    expect(
      displayedMasteryCpm({
        effectiveMasteryCpm: 210,
        savedLayoutMasteryCpm: 180,
        liveSpeedCpm: 240,
        liveAccuracy: 1,
        liveCadence: 1,
        completedChordCount: 3,
      }),
    ).toBe(210);
  });

  it("treats zero saved layout mastery as missing until live bootstrap has enough chords", () => {
    expect(
      displayedMasteryCpm({
        savedLayoutMasteryCpm: 0,
        liveSpeedCpm: 240,
        liveAccuracy: 1,
        liveCadence: 1,
        completedChordCount: 2,
      }),
    ).toBeNull();
    expect(
      displayedMasteryCpm({
        savedLayoutMasteryCpm: 0,
        liveSpeedCpm: 240,
        liveAccuracy: 1,
        liveCadence: 1,
        completedChordCount: 3,
      }),
    ).toBe(240);
  });
});

function item(char: string, chordIndex: number, chord: string): StreamItem {
  return {
    char,
    chordIndex,
    chord,
    finger: "leftIndex",
    isChordStart: char === chord[0],
  };
}

function space(chordIndex: number): StreamItem {
  return {
    char: " ",
    chordIndex,
    chord: " ",
    finger: "rightIndex",
    isChordStart: false,
    isSpace: true,
  };
}
