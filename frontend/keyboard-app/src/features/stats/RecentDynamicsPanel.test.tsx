import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecentDynamicsPanel } from "./RecentDynamicsPanel";

describe("RecentDynamicsPanel", () => {
  it("renders recent lesson deltas from newest to older history", () => {
    const markup = renderToStaticMarkup(createElement(RecentDynamicsPanel, {
      labels: {
        title: "Recent dynamics",
        empty: "No saved lessons yet",
        mastery: "Mastery",
        speed: "Speed",
        averageTempo: "Average tempo",
        accuracy: "Accuracy",
        errors: "Errors",
        standard: "Lesson",
        focus: "Focus",
        deltaUp: "+{{value}}",
        deltaDown: "-{{value}}",
        deltaFlat: "0",
      },
      units: {
        cpm: "cpm",
        percent: "%",
      },
      recent: [
        {
          id: 2,
          chordSetId: 1,
          lessonKind: "FOCUS",
          speedCpm: 190,
          averageCpm: 190,
          cadence: 0.8,
          masteryCpm: 180,
          masteryDelta: 12,
          accuracy: 0.94,
          errors: 2,
          characterCount: 190,
          correctCount: 186,
          durationMs: 20_000,
          perFinger: {},
          createdAt: "2026-06-07T10:05:00Z",
        },
        {
          id: 1,
          chordSetId: 1,
          lessonKind: "STANDARD",
          speedCpm: 170,
          averageCpm: 170,
          cadence: 0.7,
          masteryCpm: 168,
          masteryDelta: 0,
          accuracy: 0.9,
          errors: 5,
          characterCount: 170,
          correctCount: 165,
          durationMs: 21_000,
          perFinger: {},
          createdAt: "2026-06-07T10:00:00Z",
        },
      ],
    }));

    expect(markup).toContain("Focus");
    expect(markup).toContain("190 cpm");
    expect(markup).toContain("+20");
    expect(markup).toContain("+4%");
    expect(markup).toContain("-3");
  });

  it("renders as dialog content instead of an inline details block", () => {
    const markup = renderToStaticMarkup(createElement(RecentDynamicsPanel, {
      labels: {
        title: "Recent dynamics",
        empty: "No saved lessons yet",
        mastery: "Mastery",
        speed: "Speed",
        averageTempo: "Average tempo",
        accuracy: "Accuracy",
        errors: "Errors",
        standard: "Lesson",
        focus: "Focus",
        deltaUp: "+{{value}}",
        deltaDown: "-{{value}}",
        deltaFlat: "0",
      },
      units: {
        cpm: "cpm",
        percent: "%",
      },
      recent: [],
    }));

    expect(markup).toContain('class="recent-dynamics"');
    expect(markup).toContain('role="document"');
    expect(markup).not.toContain("<details");
    expect(markup).not.toContain("<summary");
  });
});
