import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LessonMaterial } from "../../../shared/api/playsay";
import { LessonTaskCanvas } from "./LessonTaskCanvas";

const material = {
  id: "material-1",
  title: "B1 words",
  description: null,
  language: "en",
  cefrLevel: "B1",
  visibility: "PRIVATE",
  status: "PUBLISHED",
  document: {
    pages: [{
      id: "page-1",
      title: "Match B1 words to definitions",
      layout: "FLOW",
      blocks: [{
        id: "block-1",
        type: "text",
        content: "Complete the task.",
      }],
    }],
  },
  sourceMeta: {},
  scoringRubric: { maxScore: 10 },
  blockCount: 1,
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
} satisfies LessonMaterial;

describe("LessonTaskCanvas", () => {
  it("lets teacher monitor mode hide fake pagination and submit controls", () => {
    const markup = renderToStaticMarkup(createElement(LessonTaskCanvas, {
      collaborationControls: null,
      lessonId: "lesson-1",
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));

    expect(markup).not.toContain("playsay-page-button");
    expect(markup).not.toContain("1 из");
    expect(markup).not.toContain("Отправить");
    expect(markup).toContain("Teacher Demo");
  });

  it("hides the score badge while a live lesson has no score yet", () => {
    const markup = renderToStaticMarkup(createElement(LessonTaskCanvas, {
      collaborationControls: null,
      lessonId: "lesson-1",
      material,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));

    expect(markup).not.toContain("playsay-material-score-badge");
    expect(markup).not.toContain("нет оценки");
  });
});
