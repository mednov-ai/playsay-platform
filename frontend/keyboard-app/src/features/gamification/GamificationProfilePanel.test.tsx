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
  leagueUnavailable: "Finish calibration",
  leagueProgress: "{{value}}% to next league",
  streak: "Streak",
  bestStreak: "Best {{value}}",
  freezes: "Freezes",
  achievements: "Achievements",
  noAchievements: "No achievements yet",
  profileTitle: "Keyboard profile",
  profileIntro: "Your league, streak and achievements live here.",
  currentMastery: "Current mastery",
  lockedAchievement: "Locked achievement",
  leagueName_calibration: "Calibration",
  leagueDescription_calibration: "Finish three lessons to place into a league.",
  leagueName_spark: "Spark",
  leagueDescription_spark: "A careful start.",
  leagueName_rhythm: "Rhythm",
  leagueDescription_rhythm: "Stable rhythm and speed.",
  leagueName_flow: "Flow",
  leagueDescription_flow: "Confident typing flow.",
  leagueName_sprint: "Sprint",
  leagueDescription_sprint: "Fast and accurate typing.",
  leagueName_master: "Master",
  leagueDescription_master: "Elite typing control.",
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
        achievements: ["METRONOME", "FIRST_HUNDRED"],
      },
    }));

    expect(markup).toContain("Keyboard profile");
    expect(markup).toContain("212 cpm");
    expect(markup).toContain("Rhythm");
    expect(markup).toContain("Stable rhythm and speed.");
    expect(markup).toContain("64% to next league");
    expect(markup).toContain("Metronome");
    expect(markup).toContain("First hundred");
    expect(markup).toContain("achievement-badge__art");
    expect(markup).not.toContain(">METRONOME<");
    expect(markup).not.toContain(">FIRST_HUNDRED<");
    expect(markup).not.toContain("New events");
  });
});
