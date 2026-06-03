import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LessonMaterialSubmission } from "../../../shared/api/playsay";
import { MaterialSubmissionsMonitor } from "./MaterialSubmissionsMonitor";

describe("MaterialSubmissionsMonitor", () => {
  it("hides the empty monitor placeholder before students answer", () => {
    const markup = renderToStaticMarkup(createElement(MaterialSubmissionsMonitor, {
      error: null,
      submissions: [],
    }));

    expect(markup).toBe("");
  });

  it("keeps the monitor visible when there is an error or submitted answer", () => {
    const submission = {
      id: "submission-1",
      content: {},
      score: 8,
      submittedAt: "2026-06-03T00:00:00.000Z",
      updatedAt: "2026-06-03T00:00:00.000Z",
      userName: "Maya",
    } as LessonMaterialSubmission;

    const errorMarkup = renderToStaticMarkup(createElement(MaterialSubmissionsMonitor, {
      error: "Failed",
      submissions: [],
    }));
    const submissionMarkup = renderToStaticMarkup(createElement(MaterialSubmissionsMonitor, {
      error: null,
      submissions: [submission],
    }));

    expect(errorMarkup).toContain("playsay-submission-monitor");
    expect(submissionMarkup).toContain("playsay-submission-monitor");
    expect(submissionMarkup).toContain("Maya");
  });
});
