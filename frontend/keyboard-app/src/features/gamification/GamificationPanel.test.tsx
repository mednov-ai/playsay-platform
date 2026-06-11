import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GamificationPanel, type GamificationPanelLabels } from "./GamificationPanel";

const labels: GamificationPanelLabels = {
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
  lockedAchievement: "Locked achievement",
  achievement_FIRST_HUNDRED_title: "First hundred",
  achievement_FIRST_HUNDRED_description: "Reach 100 cpm.",
  achievement_SNIPER_title: "Sniper",
  achievement_SNIPER_description: "Finish cleanly.",
  achievement_METRONOME_title: "Metronome",
  achievement_METRONOME_description: "Hold rhythm.",
  achievement_STREAK_7_title: "Week streak",
  achievement_STREAK_7_description: "Practice seven days.",
  achievement_STREAK_30_title: "Month streak",
  achievement_STREAK_30_description: "Practice thirty days.",
  achievement_UNKNOWN_title: "Future achievement",
  achievement_UNKNOWN_description: "A new achievement.",
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
    expect(markup).toContain("Metronome");
    expect(markup).toContain("achievement-badge__art");
    expect(markup).not.toContain(">METRONOME<");
    expect(markup).not.toContain("New events");
    expect(markup.toLowerCase()).not.toContain("score");
    expect(markup.toLowerCase()).not.toContain("rank");
  });
});
