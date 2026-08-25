import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LessonMaterial } from "../../../shared/api/playsay";
import { StudentLiveWorkspace } from "./StudentLiveWorkspace";

vi.mock("../hooks/useExternalActivitySession", () => ({
  useExternalActivitySession: () => ({
    active: null,
    cursors: [],
    isHost: false,
    mediaStream: null,
    open: vi.fn(),
    reload: vi.fn(),
    retry: vi.fn(),
    sendCursor: vi.fn(),
    sendInput: vi.fn(),
    returnToLesson: vi.fn(),
  }),
}));

const material = {
  id: "material-1",
  title: "Shared lesson",
  description: null,
  language: "en",
  cefrLevel: "A2",
  visibility: "PRIVATE",
  status: "PUBLISHED",
  document: {
    pages: [{
      id: "page-1",
      title: "Shared page",
      layout: "FLOW",
      blocks: [{
        body: "Work on the assigned material.",
        id: "block-1",
        type: "text",
      }],
    }],
  },
  sourceMeta: {},
  scoringRubric: { maxScore: 10 },
  blockCount: 1,
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
} satisfies LessonMaterial;

describe("StudentLiveWorkspace", () => {
  it("shows the assigned material without exposing document mode tabs or a side text document", () => {
    const markup = renderToStaticMarkup(createElement(StudentLiveWorkspace, {
      displayName: "Student Demo",
      lessonId: "lesson-1",
      material,
      onSaveAnswers: () => undefined,
      profileSubject: "student-demo",
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
      teacherSubject: "teacher-demo",
    }));

    expect(markup).toContain("Work on the assigned material.");
    expect(markup).toContain("Teacher Demo");
    expect(markup).not.toContain("collaboration-mode-individual");
    expect(markup).not.toContain("collaboration-mode-group");
    expect(markup).not.toContain("collaboration-live-textarea");
    expect(markup).not.toContain("collaboration-finalize-button");
    expect(markup).not.toContain("My work");
    expect(markup).not.toContain("My document");
    expect(markup).not.toContain("Group document");
  });
});
