import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LessonMaterial } from "../../../shared/api/playsay";
import { MaterialPlayPreviewDialog } from "./MaterialPlayPreviewDialog";

const material = {
  id: "material-play-preview",
  title: "Gerund practice",
  description: "Student-facing preview",
  language: "en",
  cefrLevel: "A2",
  visibility: "PRIVATE",
  status: "DRAFT",
  document: {
    pages: [{
      id: "page-1",
      title: "Preview page",
      layout: "FLOW",
      blocks: [{
        id: "block-1",
        type: "fillGaps",
        title: "Complete the sentence",
        items: [{ id: "gap-1", prompt: "I enjoy ␣ English.", answer: "learning" }],
      }],
    }],
  },
  sourceMeta: {},
  scoringRubric: { maxScore: 10 },
  blockCount: 1,
  createdAt: "2026-05-31T00:00:00.000Z",
  updatedAt: "2026-05-31T00:00:00.000Z",
} satisfies LessonMaterial;

describe("MaterialPlayPreviewDialog", () => {
  it("does not render when closed", () => {
    const markup = renderToStaticMarkup(createElement(MaterialPlayPreviewDialog, {
      material,
      onClose: () => undefined,
      open: false,
    }));

    expect(markup).toBe("");
  });

  it("renders student preview controls and material content when open", () => {
    const markup = renderToStaticMarkup(createElement(MaterialPlayPreviewDialog, {
      material,
      onClose: () => undefined,
      open: true,
    }));

    expect(markup).toContain("role=\"dialog\"");
    expect(markup).toContain("playsay-material-play-dialog");
    expect(markup).toContain("Gerund practice");
    expect(markup).toContain("Preview page");
    expect(markup).toContain("playsay-rendered-material");
    expect(markup).toContain("Сбросить ответы");
    expect(markup).toContain("Закрыть");
  });
});
