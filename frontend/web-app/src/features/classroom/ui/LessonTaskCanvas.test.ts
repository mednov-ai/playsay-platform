// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonMaterial } from "../../../shared/api/playsay";
import { LessonTaskCanvas } from "./LessonTaskCanvas";

const apiMocks = vi.hoisted(() => ({
  fetchAnnotation: vi.fn(),
  saveAnnotation: vi.fn(),
}));

vi.mock("../../../shared/api/playsay", () => ({
  fetchScheduledLessonMaterialAnnotation: apiMocks.fetchAnnotation,
  saveScheduledLessonMaterialAnnotation: apiMocks.saveAnnotation,
}));

vi.mock("../../../shared/i18n", () => ({
  i18n: { t: (key: string) => key },
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

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

const staticImageMaterial = {
  ...material,
  id: "material-static",
  document: {
    schemaVersion: 1,
    pages: [{
      id: "page-static",
      title: "Static worksheet",
      layout: "STATIC_IMAGE",
      blocks: [{
        id: "image-1",
        type: "image",
        title: "Static worksheet",
        url: "https://example.com/static.png",
        objectFit: "contain",
      }],
    }],
  },
  blockCount: 1,
} satisfies LessonMaterial;

const twoPageMaterial = {
  ...material,
  document: {
    schemaVersion: 1,
    pages: [
      ...material.document.pages,
      {
        id: "page-2",
        title: "Second page",
        layout: "FLOW",
        blocks: [{ id: "block-2", type: "text", content: "Second task." }],
      },
    ],
  },
  blockCount: 2,
} satisfies LessonMaterial;

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.fetchAnnotation.mockResolvedValue({
    content: {
      activePageId: "page-2",
      coordinateSpace: "material-page",
      schemaVersion: 2,
      strokes: [],
    },
  });
  apiMocks.saveAnnotation.mockResolvedValue({});
});

describe("LessonTaskCanvas", () => {
  it("applies a live upload page once and then keeps a manual page selection", async () => {
    const { container } = render(createElement(LessonTaskCanvas, {
      canControlPages: true,
      lessonId: "lesson-1",
      liveActivePageId: "page-2",
      material: twoPageMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));
    const buttons = container.querySelectorAll<HTMLButtonElement>(".playsay-page-picker-button");

    await waitFor(() => expect(buttons[1]?.getAttribute("data-active")).toBe("true"));
    fireEvent.click(buttons[0]!);
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    expect(buttons[0]?.getAttribute("data-active")).toBe("true");
    expect(buttons[1]?.getAttribute("data-active")).toBe("false");
  });

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

  it("does not show answer submit controls for a non-answer static image page", () => {
    const markup = renderToStaticMarkup(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material: staticImageMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));

    expect(markup).toContain("Static worksheet");
    expect(markup).not.toContain("Отправить");
    expect(markup).not.toContain("Submit");
  });
});
