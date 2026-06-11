import { describe, expect, it } from "vitest";
import type { GamificationProfile, Progress } from "../../shared/types";
import { activeLayoutGamification, layoutMasteryCpm } from "./KeyboardTrainerShell";

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
});
