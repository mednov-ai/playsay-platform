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
  events: "New events",
  noEvents: "No new events",
  masteryUp: "Mastery +{{delta}}",
  calibrationComplete: "Calibration complete",
  leagueProgressEvent: "League {{level}} progress",
  achievementUnlocked: "Achievement {{code}}",
  prizeHook: "Prize hook",
};

describe("GamificationPanel", () => {
  it("renders calibration, league, streak, achievements and events without score language", () => {
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
      events: [
        {
          id: 1,
          type: "MASTERY_UP",
          payload: { delta: "8.5" },
          createdAt: "2026-06-11T12:00:00Z",
        },
      ],
    }));

    expect(markup).toContain("Calibration");
    expect(markup).toContain("2/3 lessons");
    expect(markup).toContain("League 1");
    expect(markup).toContain("42% to next league");
    expect(markup).toContain("4");
    expect(markup).toContain("METRONOME");
    expect(markup).toContain("Mastery +8.5");
    expect(markup.toLowerCase()).not.toContain("score");
    expect(markup.toLowerCase()).not.toContain("rank");
  });
});
