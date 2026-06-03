import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LessonMaterialSubmission } from "../../../shared/api/playsay";
import type { StudentHealthView } from "../model/studentHealth";
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

  it("renders student health cards without exposing internal numeric health", () => {
    const health: StudentHealthView[] = [{
      baselineErrorsCount: 1,
      consecutiveErrorIncreases: 2,
      currentErrorsCount: 3,
      newErrors: 2,
      previousErrorsCount: 3,
      subject: "student-1",
      tone: "hot",
      updatedAt: "2026-06-03T00:00:00.000Z",
    }];

    const markup = renderToStaticMarkup(createElement(MaterialSubmissionsMonitor, {
      activeStudentSubject: "student-1",
      error: null,
      health,
      onSelectStudent: () => undefined,
      participants: [{
        subject: "student-1",
        username: "maya",
        displayName: "Maya",
        attendanceStatus: "PRESENT",
        materialId: "material-1",
        materialTitle: "Grammar",
      }],
      submissions: [],
    }));

    expect(markup).toContain("playsay-student-health-card");
    expect(markup).toContain('data-health="hot"');
    expect(markup).toContain('data-active="true"');
    expect(markup).not.toContain("2 new");
  });
});
