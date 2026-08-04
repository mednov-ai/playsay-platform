// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LessonMaterial } from "../../../shared/api/playsay";
import { emptyAnnotationContent } from "../model/annotation";
import { ControlledAnnotationCanvas } from "./ControlledAnnotationCanvas";

vi.mock("../../../shared/api/playsay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/api/playsay")>()),
  fetchMaterialAssets: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../shared/i18n", () => ({
  i18n: { t: (key: string) => key },
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

describe("ControlledAnnotationCanvas", () => {
  it("shows annotation tools only when the active homework page contains an image", () => {
    const { container, rerender } = render(
      <ControlledAnnotationCanvas
        answers={{}}
        content={emptyAnnotationContent("page-1")}
        material={materialWithBlock("image")}
        onChange={() => undefined}
      />,
    );

    expect(container.querySelector(".playsay-annotation-toolbar")).toBeTruthy();

    rerender(
      <ControlledAnnotationCanvas
        answers={{}}
        content={emptyAnnotationContent("page-1")}
        material={materialWithBlock("text")}
        onChange={() => undefined}
      />,
    );

    expect(container.querySelector(".playsay-annotation-toolbar")).toBeNull();
  });

  it("keeps submitted teacher results read-only", () => {
    const { container } = render(
      <ControlledAnnotationCanvas
        answers={{}}
        content={emptyAnnotationContent("page-1")}
        material={materialWithBlock("image")}
        onChange={() => undefined}
        readOnly
      />,
    );

    expect(container.querySelector(".playsay-annotation-toolbar")).toBeNull();
    expect(container.querySelector(".playsay-controlled-annotation-canvas")?.getAttribute("data-read-only")).toBe("true");
  });
});

function materialWithBlock(type: "image" | "text"): LessonMaterial {
  const block = type === "image"
    ? {
        id: "image-1",
        type: "image",
        title: "Worksheet",
        url: "https://example.test/worksheet.png",
      }
    : {
        body: "Read the prompt",
        id: "text-1",
        type: "text",
        title: "Prompt",
      };
  return {
    blockCount: 1,
    cefrLevel: "A2",
    createdAt: "2026-08-04T10:00:00.000Z",
    description: null,
    document: {
      pages: [{ blocks: [block], id: "page-1", layout: "FLOW", title: "Task" }],
      schemaVersion: 1,
    },
    id: `material-${type}`,
    language: "en",
    scoringRubric: {},
    skillTags: [],
    sourceMeta: {},
    status: "PUBLISHED",
    title: "Homework",
    topicTags: [],
    updatedAt: "2026-08-04T10:00:00.000Z",
    visibility: "PRIVATE",
  };
}
