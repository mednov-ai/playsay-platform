import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LessonMaterial } from "../../../shared/api/playsay";
import { LessonMaterialDocumentView } from "./LessonMaterialDocumentView";

const material = {
  id: "material-1",
  title: "Live material",
  description: null,
  language: "en",
  cefrLevel: "A2",
  visibility: "PRIVATE",
  status: "PUBLISHED",
  document: {
    schemaVersion: 1,
    pages: [
      {
        id: "page-1",
        title: "Warm-up",
        layout: "FLOW",
        blocks: [{ id: "text-1", type: "text", title: "Warm-up", body: "First page body" }],
      },
      {
        id: "page-static",
        title: "Live worksheet",
        layout: "STATIC_IMAGE",
        blocks: [{
          id: "image-1",
          type: "image",
          title: "Live worksheet",
          url: "https://example.com/worksheet.png",
          objectFit: "contain",
        }],
      },
    ],
  },
  sourceMeta: {},
  scoringRubric: { maxScore: 10 },
  topicTags: [],
  skillTags: [],
  blockCount: 2,
  createdAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
} satisfies LessonMaterial;

describe("LessonMaterialDocumentView page rendering", () => {
  it("renders the selected static image page instead of the first page", () => {
    const markup = renderToStaticMarkup(
      <LessonMaterialDocumentView
        activePageId="page-static"
        canControlPages
        material={material}
        onActivePageIdChange={() => undefined}
      />,
    );

    expect(markup).toContain("Live worksheet");
    expect(markup).toContain("playsay-page-picker");
    expect(markup).toContain("playsay-static-image-page");
    expect(markup).toContain('data-playsay-page-id="page-static"');
    expect(markup).not.toContain("First page body");
  });
});
