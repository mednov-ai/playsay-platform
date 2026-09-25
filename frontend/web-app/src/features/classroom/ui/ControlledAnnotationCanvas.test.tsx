// @vitest-environment jsdom

import { useState } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonMaterial } from "../../../shared/api/playsay";
import { emptyAnnotationContent, type AnnotationContent } from "../model/annotation";
import { ControlledAnnotationCanvas } from "./ControlledAnnotationCanvas";

const apiMocks = vi.hoisted(() => ({
  fetchMaterialAssets: vi.fn(),
  fetchMaterialAssetText: vi.fn(),
}));

vi.mock("../../../shared/api/playsay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/api/playsay")>()),
  fetchMaterialAssets: apiMocks.fetchMaterialAssets,
  fetchMaterialAssetText: apiMocks.fetchMaterialAssetText,
}));

vi.mock("../../../shared/i18n", () => ({
  i18n: { t: (key: string) => key },
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

describe("ControlledAnnotationCanvas", () => {
  beforeEach(() => {
    apiMocks.fetchMaterialAssets.mockResolvedValue([]);
    apiMocks.fetchMaterialAssetText.mockResolvedValue("<html><body><button>Start</button></body></html>");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("preserves edited text through the controlled homework parent and blur", async () => {
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) });
    const naturalWidth = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(800);
    const naturalHeight = vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(600);
    const material = materialWithBlock("image");
    function Homework() {
      const [content, setContent] = useState<AnnotationContent>({
        ...emptyAnnotationContent("page-1"),
        elements: [{ id: "note", kind: "text", pageId: "page-1", text: "Before",
          x: 10, y: 10, width: 200, height: 80, fontSize: 18, color: "#ff5c00",
          fill: "transparent", autoWidth: true, autoHeight: true, createdAt: 1 }],
      });
      return <ControlledAnnotationCanvas answers={{}} content={content} material={material} onChange={setContent} />;
    }
    const { container, unmount } = render(<Homework />);
    try {
      await waitFor(() => expect(container.querySelector("foreignObject")).toBeTruthy());
      fireEvent.doubleClick(container.querySelector("foreignObject")!);
      const editor = container.querySelector("textarea")!;
      fireEvent.change(editor, { target: { value: "  Homework\nПоследний символ я  " } });
      fireEvent.blur(editor);
      expect(container.querySelector(".playsay-annotation-text-text span")?.textContent).toBe("  Homework\nПоследний символ я  ");
      await waitFor(() => expect(container.querySelector("foreignObject")).toBeTruthy());
      fireEvent.doubleClick(container.querySelector("foreignObject")!);
      expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("  Homework\nПоследний символ я  ");
    } finally {
      unmount();
      rectSpy.mockRestore();
      naturalWidth.mockRestore();
      naturalHeight.mockRestore();
    }
  });
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

  it("does not edit loaded image annotations in read-only review", async () => {
    const width = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(600);
    const height = vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(1200);
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 600, 1200));
    const onChange = vi.fn();
    const { container } = render(<ControlledAnnotationCanvas answers={{}} content={emptyAnnotationContent("page-1")}
      material={materialWithBlock("image")} onChange={onChange} readOnly />);
    try {
      await waitFor(() => expect(container.querySelector('.playsay-annotation-layer[data-anchor-id="image-1"]')).not.toBeNull());
      onChange.mockClear();
      fireEvent.pointerDown(container.querySelector('.playsay-annotation-layer')!, { clientX: 150, clientY: 300 });
      fireEvent.pointerUp(container.querySelector('.playsay-annotation-layer')!, { clientX: 200, clientY: 350 });
      expect(onChange).not.toHaveBeenCalled();
    } finally { width.mockRestore(); height.mockRestore(); rect.mockRestore(); }
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

  it("opens a homework HTML game as focused material without remounting it on minimize", async () => {
    apiMocks.fetchMaterialAssets.mockResolvedValue([{
      contentUrl: "/api/materials/material-html-game/assets/game-asset/content",
      createdAt: "2026-08-04T10:00:00.000Z",
      externalUrl: null,
      id: "game-asset",
      kind: "HTML_GAME",
      materialId: "material-html-game",
      metadata: {},
      provider: "PLAYSAY",
      storageKey: "materials/material-html-game/game-asset.html",
    }]);

    const { container } = render(
      <ControlledAnnotationCanvas
        answers={{}}
        content={emptyAnnotationContent("page-1")}
        material={materialWithHtmlGame()}
        onChange={() => undefined}
      />,
    );

    await waitFor(() => expect(apiMocks.fetchMaterialAssetText).toHaveBeenCalledWith("material-html-game", "game-asset"));

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='html-game-launch-game-1']")!);

    await waitFor(() => expect(container.querySelector(".playsay-html-game iframe")).not.toBeNull());
    expect(container.querySelector(".playsay-controlled-annotation-canvas")?.getAttribute("data-presentation-mode")).toBe("html-game-focus");
    expect(container.querySelector(".playsay-material-focus-stack")?.getAttribute("data-active")).toBe("true");
    expect(container.querySelector(".playsay-material-focus-stack")?.getAttribute("data-kind")).toBe("htmlGame");
    expect(container.querySelector(".playsay-html-game")?.getAttribute("data-fill-available")).toBe("true");

    const iframe = container.querySelector(".playsay-html-game iframe");
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='material-focus-close']")!);

    expect(container.querySelector(".playsay-controlled-annotation-canvas")?.getAttribute("data-presentation-mode")).toBe("default");
    expect(container.querySelector(".playsay-html-game iframe")).toBe(iframe);
    expect(container.querySelector(".playsay-material-focused-game")?.getAttribute("data-active")).toBe("false");

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='html-game-launch-game-1']")!);

    expect(container.querySelector(".playsay-controlled-annotation-canvas")?.getAttribute("data-presentation-mode")).toBe("html-game-focus");
    expect(container.querySelector(".playsay-html-game iframe")).toBe(iframe);
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

function materialWithHtmlGame(): LessonMaterial {
  return {
    blockCount: 1,
    cefrLevel: "A2",
    createdAt: "2026-08-04T10:00:00.000Z",
    description: null,
    document: {
      pages: [{
        blocks: [{ id: "game-1", title: "Word race", type: "htmlGame", url: "material-asset:game-asset" }],
        id: "page-1",
        layout: "FLOW",
        title: "Task",
      }],
      schemaVersion: 1,
    },
    id: "material-html-game",
    language: "en",
    scoringRubric: {},
    skillTags: [],
    sourceMeta: {},
    status: "PUBLISHED",
    title: "Homework game",
    topicTags: [],
    updatedAt: "2026-08-04T10:00:00.000Z",
    visibility: "PRIVATE",
  };
}
