import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AchievementCelebrationQueue, type AchievementCelebrationLabels } from "./AchievementCelebrationQueue";

const labels: AchievementCelebrationLabels = {
  events: "New events",
  masteryUp: "Mastery +{{delta}}",
  calibrationComplete: "Calibration complete",
  leagueProgressEvent: "Moved to {{leagueName}}",
  achievementUnlocked: "{{title}} unlocked",
  prizeHook: "Future prize event",
  closeEvent: "Close event",
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

describe("AchievementCelebrationQueue", () => {
  it("renders unlocked achievements as illustrated animated celebrations", () => {
    const markup = renderToStaticMarkup(createElement(AchievementCelebrationQueue, {
      labels,
      events: [
        {
          id: 7,
          type: "ACHIEVEMENT_UNLOCKED",
          payload: { code: "METRONOME" },
          createdAt: "2026-06-11T12:00:00Z",
        },
      ],
      paused: false,
      onDismiss: () => undefined,
    }));

    expect(markup).toContain("achievement-celebration");
    expect(markup).toContain("achievement-badge__art");
    expect(markup).toContain("Metronome unlocked");
    expect(markup).toContain("Hold rhythm.");
    expect(markup).not.toContain(">METRONOME<");
  });

  it("keeps queued events hidden while high priority overlays are active", () => {
    const markup = renderToStaticMarkup(createElement(AchievementCelebrationQueue, {
      labels,
      events: [
        {
          id: 7,
          type: "ACHIEVEMENT_UNLOCKED",
          payload: { code: "METRONOME" },
          createdAt: "2026-06-11T12:00:00Z",
        },
      ],
      paused: true,
      onDismiss: () => undefined,
    }));

    expect(markup).toBe("");
  });

  it("renders league events with a named tier instead of a raw number", () => {
    const markup = renderToStaticMarkup(createElement(AchievementCelebrationQueue, {
      labels,
      events: [
        {
          id: 8,
          type: "LEAGUE_PROGRESS",
          payload: { leagueLevel: "2" },
          createdAt: "2026-06-11T12:00:00Z",
        },
      ],
      paused: false,
      onDismiss: () => undefined,
    }));

    expect(markup).toContain("Moved to Rhythm");
    expect(markup).not.toContain("League 2");
  });
});
