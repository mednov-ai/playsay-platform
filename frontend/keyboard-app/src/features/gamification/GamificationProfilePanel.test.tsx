import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GamificationProfilePanel, type GamificationProfileLabels } from "./GamificationProfilePanel";

const labels: GamificationProfileLabels = {
  title: "Progress profile",
  calibration: "Calibration",
  calibrationProgress: "{{done}}/{{total}} lessons",
  calibrated: "Calibrated",
  league: "League",
  leagueFallback: "League {{level}}",
  leagueProgress: "{{value}}% to next league",
  streak: "Streak",
  bestStreak: "Best {{value}}",
  freezes: "Freezes",
  achievements: "Achievements",
  noAchievements: "No achievements yet",
  profileTitle: "Keyboard profile",
  profileIntro: "Your league, streak and achievements live here.",
  masteryTrend: "Mastery trend",
  currentMastery: "Current mastery",
};

describe("GamificationProfilePanel", () => {
  it("shows gamification state and achievements as a profile surface", () => {
    const markup = renderToStaticMarkup(createElement(GamificationProfilePanel, {
      labels,
      units: { cpm: "cpm" },
      gamification: {
        calibrated: true,
        calibrationSessions: 3,
        calibrationTarget: 3,
        masteryCpm: 212,
        baselineMasteryCpm: 188,
        leagueLevel: 2,
        leagueProgress: 64,
        currentStreak: 6,
        bestStreak: 8,
        streakFreezes: 1,
        trend: [188, 196, 212],
        achievements: ["STEADY_RHYTHM", "FIRST_LEAGUE"],
      },
    }));

    expect(markup).toContain("Keyboard profile");
    expect(markup).toContain("212 cpm");
    expect(markup).toContain("League 2");
    expect(markup).toContain("64% to next league");
    expect(markup).toContain("STEADY_RHYTHM");
    expect(markup).toContain("FIRST_LEAGUE");
    expect(markup).not.toContain("New events");
  });
});
