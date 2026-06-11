import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GamificationPanel } from "./GamificationPanel";

const labels = {
  title: "Growth",
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
};

describe("GamificationPanel", () => {
  it("renders calibration, league, streak and achievements without score language", () => {
    const markup = renderToStaticMarkup(createElement(GamificationPanel, {
      labels,
      gamification: {
        calibrated: false,
        calibrationSessions: 2,
        calibrationTarget: 3,
        masteryCpm: 188,
        baselineMasteryCpm: undefined,
        leagueLevel: 1,
        leagueProgress: 42,
        currentStreak: 4,
        bestStreak: 5,
        streakFreezes: 1,
        trend: [160, 172, 188],
        achievements: ["METRONOME"],
      },
    }));

    expect(markup).toContain("Calibration");
    expect(markup).toContain("2/3 lessons");
    expect(markup).toContain("League 1");
    expect(markup).toContain("42% to next league");
    expect(markup).toContain("4");
    expect(markup).toContain("METRONOME");
    expect(markup).not.toContain("New events");
    expect(markup.toLowerCase()).not.toContain("score");
    expect(markup.toLowerCase()).not.toContain("rank");
  });
});
