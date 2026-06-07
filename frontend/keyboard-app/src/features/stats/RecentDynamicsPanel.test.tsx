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
        speed: "Speed",
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
          accuracy: 0.94,
          errors: 2,
          durationMs: 20_000,
          perFinger: {},
          createdAt: "2026-06-07T10:05:00Z",
        },
        {
          id: 1,
          chordSetId: 1,
          lessonKind: "STANDARD",
          speedCpm: 170,
          accuracy: 0.9,
          errors: 5,
          durationMs: 21_000,
          perFinger: {},
          createdAt: "2026-06-07T10:00:00Z",
        },
      ],
    }));

    expect(markup).toContain("Recent dynamics");
    expect(markup).toContain("Focus");
    expect(markup).toContain("190 cpm");
    expect(markup).toContain("+20");
    expect(markup).toContain("+4%");
    expect(markup).toContain("-3");
  });
});
