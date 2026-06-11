import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GamificationEventQueue, type GamificationEventQueueLabels } from "./GamificationEventQueue";

const labels: GamificationEventQueueLabels = {
  events: "New events",
  masteryUp: "Mastery +{{delta}}",
  calibrationComplete: "Calibration complete",
  leagueProgressEvent: "League {{level}} progress",
  achievementUnlocked: "Achievement {{code}}",
  prizeHook: "Future prize event",
  closeEvent: "Close event",
};

describe("GamificationEventQueue", () => {
  it("renders post-result events as transient celebration items without the full gamification panel", () => {
    const markup = renderToStaticMarkup(createElement(GamificationEventQueue, {
      labels,
      events: [
        {
          id: 7,
          type: "ACHIEVEMENT_UNLOCKED",
          payload: { code: "STEADY_RHYTHM" },
          createdAt: "2026-06-11T12:00:00Z",
        },
      ],
      onDismiss: () => undefined,
    }));

    expect(markup).toContain("New events");
    expect(markup).toContain("Achievement STEADY_RHYTHM");
    expect(markup).toContain("Close event");
    expect(markup).toContain("gamification-event-queue");
    expect(markup).not.toContain("gamification-panel__grid");
    expect(markup).not.toContain("Achievements");
  });
});
