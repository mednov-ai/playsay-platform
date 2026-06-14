import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GamificationPanel, type GamificationPanelLabels } from "./GamificationPanel";
import { leagueLabelsForLevel, type LeagueCatalogLabels } from "./leagueCatalog";

const leagueLabels: LeagueCatalogLabels = {
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
};

const labels: GamificationPanelLabels = {
  title: "Growth",
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
  lockedAchievement: "Locked achievement",
  ...leagueLabels,
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
    expect(markup).toContain("Spark");
    expect(markup).toContain("A careful start.");
    expect(markup).toContain("42% to next league");
    expect(markup).toContain("4");
    expect(markup).toContain("Metronome");
    expect(markup).toContain("achievement-badge__art");
    expect(markup).not.toContain(">METRONOME<");
    expect(markup).not.toContain("New events");
    expect(markup.toLowerCase()).not.toContain("score");
    expect(markup.toLowerCase()).not.toContain("rank");
  });

  it("renders an explicit calibration state when the active layout has no league", () => {
    const markup = renderToStaticMarkup(createElement(GamificationPanel, {
      labels,
      gamification: {
        calibrated: false,
        calibrationSessions: 0,
        calibrationTarget: 3,
        masteryCpm: 0,
        baselineMasteryCpm: undefined,
        leagueLevel: undefined,
        leagueProgress: 0,
        currentStreak: 4,
        bestStreak: 5,
        streakFreezes: 1,
        trend: [],
        achievements: ["METRONOME"],
      },
    }));

    expect(markup).toContain("Finish calibration");
    expect(markup).toContain("Finish three lessons to place into a league.");
    expect(markup).not.toContain("League 0");
  });

  it("maps internal league levels to named player tiers", () => {
    expect(leagueLabelsForLevel(undefined, leagueLabels).name).toBe("Calibration");
    expect(leagueLabelsForLevel(0, leagueLabels).name).toBe("Calibration");
    expect(leagueLabelsForLevel(1, leagueLabels).name).toBe("Spark");
    expect(leagueLabelsForLevel(2, leagueLabels).name).toBe("Rhythm");
    expect(leagueLabelsForLevel(5, leagueLabels).name).toBe("Master");
  });
});
