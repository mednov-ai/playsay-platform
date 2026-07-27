// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonMaterial } from "../../../shared/api/playsay";
import type { MaterialExerciseSync, MaterialHtmlGameSync } from "../../materials/model/materialDocument";
import { LessonTaskCanvas } from "./LessonTaskCanvas";

const apiMocks = vi.hoisted(() => ({
  fetchMaterialAssetText: vi.fn(),
  fetchMaterialAssets: vi.fn(),
  fetchAnnotation: vi.fn(),
  saveAnnotation: vi.fn(),
}));

vi.mock("../../../shared/api/playsay", () => ({
  fetchMaterialAssetText: apiMocks.fetchMaterialAssetText,
  fetchMaterialAssets: apiMocks.fetchMaterialAssets,
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

const freeWritingMaterial = {
  ...material,
  id: "material-writing",
  document: {
    schemaVersion: 1,
    pages: [{
      id: "page-writing",
      title: "Write together",
      layout: "FLOW",
      blocks: [{
        id: "writing-1",
        type: "freeWriting",
        title: "Shared answer",
        prompt: "Describe the weather.",
      }],
    }],
  },
  blockCount: 1,
} satisfies LessonMaterial;

const flowImageMaterial = {
  ...material,
  id: "material-flow-images",
  document: {
    schemaVersion: 1,
    pages: [{
      id: "page-1",
      title: "Image worksheet",
      layout: "FLOW",
      blocks: [{
        id: "image-a",
        type: "image",
        title: "Worksheet A",
        url: "https://example.com/a.png",
        imageSize: "FULL",
      }, {
        id: "image-b",
        type: "generatedImage",
        title: "Worksheet B",
        url: "https://example.com/b.png",
        imageSize: "FULL",
      }],
    }],
  },
  blockCount: 2,
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

const htmlGameMaterial = {
  ...material,
  id: "material-game",
  document: {
    schemaVersion: 1,
    pages: [{
      id: "page-game",
      title: "Pair up",
      layout: "HTML_GAME",
      blocks: [{
        id: "game-1",
        type: "htmlGame",
        title: "Pair up",
        url: "material-asset:asset-game",
        height: 640,
      }, {
        id: "game-2",
        type: "htmlGame",
        title: "Word race",
        url: "material-asset:asset-game-2",
        height: 640,
      }],
    }],
  },
  blockCount: 2,
} satisfies LessonMaterial;

const gameAndWorksheetMaterial = {
  ...htmlGameMaterial,
  document: {
    schemaVersion: 1,
    pages: [
      ...htmlGameMaterial.document.pages,
      {
        id: "page-worksheet",
        title: "Worksheet",
        layout: "FLOW",
        blocks: [{ id: "text-2", type: "text", content: "Read the prompt." }],
      },
    ],
  },
  blockCount: 2,
} satisfies LessonMaterial;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
  apiMocks.fetchAnnotation.mockResolvedValue({
    content: {
      activePageId: "page-1",
      coordinateSpace: "material-page",
      schemaVersion: 2,
      strokes: [],
    },
  });
  apiMocks.saveAnnotation.mockResolvedValue({});
  apiMocks.fetchMaterialAssets.mockResolvedValue([{
    id: "asset-game",
    kind: "HTML_GAME",
    contentUrl: "/api/materials/material-game/assets/asset-game/content",
  }, {
    id: "asset-game-2",
    kind: "HTML_GAME",
    contentUrl: "/api/materials/material-game/assets/asset-game-2/content",
  }]);
  apiMocks.fetchMaterialAssetText.mockResolvedValue("<!doctype html><html><body><button>Start</button></body></html>");
});

describe("LessonTaskCanvas", () => {
  it("renders shared exercise answers and publishes edits to the collaboration document", () => {
    const setAnswer = vi.fn();
    const seedAnswers = vi.fn();
    const exerciseSync: MaterialExerciseSync = {
      answers: {
        "writing-1": { type: "freeWriting", text: "It is sunny." },
      },
      participants: [],
      ready: true,
      seedAnswers,
      setAnswer,
      updateInteraction: vi.fn(),
    };
    const { container } = render(createElement(LessonTaskCanvas, {
      exerciseSync,
      lessonId: "lesson-1",
      material: freeWritingMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));
    const textarea = container.querySelector<HTMLTextAreaElement>(".playsay-student-answer")!;

    expect(textarea.value).toBe("It is sunny.");
    fireEvent.change(textarea, { target: { value: "It is raining." } });
    expect(setAnswer).toHaveBeenCalledWith("writing-1", expect.objectContaining({
      text: "It is raining.",
      type: "freeWriting",
    }));
    expect(seedAnswers).toHaveBeenCalledWith({});
  });

  it("shows a localized empty state instead of an English exercise when no material is assigned", () => {
    const markup = renderToStaticMarkup(createElement(LessonTaskCanvas, {
      lessonId: "lesson-empty",
      material: null,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));

    expect(markup).toContain("lesson-material-empty");
    expect(markup).toContain("classroom.material.unassignedTitle");
    expect(markup).toContain("classroom.material.unassignedBody");
    expect(markup).not.toContain("Let&#x27;s chat");
    expect(markup).not.toContain("The importance of food for travellers");
  });

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

  it("anchors annotations to the rendered static image instead of the material viewport", async () => {
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("playsay-task-document-surface")) {
        return domRect({ height: 900, left: 10, top: 20, width: 800 });
      }
      if (this.getAttribute("data-playsay-annotation-anchor-id") === "image-1") {
        return domRect({ height: 1200, left: 30, top: 70, width: 760 });
      }
      return domRect({ height: 0, left: 0, top: 0, width: 0 });
    });

    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material: staticImageMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));

    await waitFor(() => {
      const layer = container.querySelector<SVGSVGElement>('.playsay-annotation-layer[data-anchored="true"]');
      expect(layer?.getAttribute("data-anchor-pending")).toBe("false");
      expect(layer?.style.left).toBe("20px");
      expect(layer?.style.top).toBe("50px");
      expect(layer?.style.width).toBe("760px");
      expect(layer?.style.height).toBe("1200px");
    });

    rectSpy.mockRestore();
  });

  it("creates independent annotation layers for ordinary flow images", async () => {
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("playsay-task-document-surface")) {
        return domRect({ height: 900, left: 10, top: 20, width: 800 });
      }
      if (this.getAttribute("data-playsay-annotation-anchor-id") === "image-a" || this.getAttribute("data-anchor-id") === "image-a") {
        return domRect({ height: 400, left: 30, top: 70, width: 760 });
      }
      if (this.getAttribute("data-playsay-annotation-anchor-id") === "image-b" || this.getAttribute("data-anchor-id") === "image-b") {
        return domRect({ height: 300, left: 50, top: 510, width: 720 });
      }
      return domRect({ height: 0, left: 0, top: 0, width: 0 });
    });

    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material: flowImageMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));

    await waitFor(() => expect(container.querySelectorAll('.playsay-annotation-layer[data-anchored="true"]')).toHaveLength(2));
    const firstLayer = container.querySelector<SVGSVGElement>('.playsay-annotation-layer[data-anchor-id="image-a"]')!;
    const secondLayer = container.querySelector<SVGSVGElement>('.playsay-annotation-layer[data-anchor-id="image-b"]')!;
    expect(firstLayer.style).toEqual(expect.objectContaining({ height: "400px", left: "20px", top: "50px", width: "760px" }));
    expect(secondLayer.style).toEqual(expect.objectContaining({ height: "300px", left: "40px", top: "490px", width: "720px" }));

    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-testid="annotation-tool-text"]')!);
    fireEvent.pointerDown(firstLayer, { button: 0, clientX: 410, clientY: 270, pointerId: 1 });
    await waitFor(() => expect(apiMocks.saveAnnotation).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({
        content: expect.objectContaining({
          elements: expect.arrayContaining([expect.objectContaining({ anchorId: "image-a", kind: "text" })]),
          schemaVersion: 7,
        }),
      }),
    ), { timeout: 1_500 });

    rectSpy.mockRestore();
  });

  it("keeps anchored text aligned while a focused image scrolls", async () => {
    apiMocks.fetchAnnotation.mockResolvedValueOnce({
      content: {
        activePageId: "page-1",
        coordinateSpace: "material-page",
        elements: [{
          anchorId: "image-a",
          autoWidth: true,
          color: "#ff5c00",
          createdAt: 1,
          fill: "transparent",
          fontSize: 18,
          height: 34,
          id: "anchored-text",
          kind: "text",
          pageId: "page-1",
          text: "Scroll with me",
          width: 120,
          x: 200,
          y: 300,
        }],
        schemaVersion: 6,
      },
    });
    let focusedImageTop = 80;
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("playsay-task-document-surface")) {
        return domRect({ height: 900, left: 10, top: 20, width: 800 });
      }
      if (this.getAttribute("data-playsay-annotation-anchor-id") === "image-a") {
        const focused = Boolean(this.closest('.playsay-material-focus-stack[data-active="true"]'));
        return focused
          ? domRect({ height: 1800, left: 10, top: focusedImageTop, width: 800 })
          : domRect({ height: 400, left: 30, top: 70, width: 760 });
      }
      if (this.getAttribute("data-playsay-annotation-anchor-id") === "image-b") {
        return domRect({ height: 300, left: 50, top: 510, width: 720 });
      }
      return domRect({ height: 0, left: 0, top: 0, width: 0 });
    });

    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material: flowImageMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));

    const taskDocument = container.querySelector<HTMLElement>(".playsay-task-document")!;
    taskDocument.scrollLeft = 18;
    taskDocument.scrollTop = 254;
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-testid="material-image-focus-image-a"]')!);
    expect(taskDocument.scrollLeft).toBe(0);
    expect(taskDocument.scrollTop).toBe(0);
    const focusedScroller = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.playsay-material-focus-stack[data-active="true"] .playsay-material-focused-image');
      expect(element).toBeTruthy();
      return element!;
    });
    const anchoredLayer = await waitFor(() => {
      const element = container.querySelector<SVGSVGElement>('.playsay-annotation-layer[data-anchor-id="image-a"]');
      expect(element?.style.top).toBe("60px");
      expect(element?.querySelector(".playsay-annotation-text-text")?.textContent).toContain("Scroll with me");
      return element!;
    });

    focusedImageTop = -120;
    fireEvent.scroll(focusedScroller);

    await waitFor(() => {
      expect(anchoredLayer.style.top).toBe("-140px");
      expect(Number.parseFloat(anchoredLayer.style.top) - (focusedImageTop - 20)).toBe(0);
    });

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='material-focus-close']")!);
    expect(taskDocument.scrollLeft).toBe(18);
    expect(taskDocument.scrollTop).toBe(254);
    rectSpy.mockRestore();
  });

  it("reanchors a legacy page element when it is selected over a flow image", async () => {
    apiMocks.fetchAnnotation.mockResolvedValueOnce({
      content: {
        activePageId: "page-1",
        coordinateSpace: "material-page",
        elements: [{
          color: "#ff5c00",
          createdAt: 1,
          fill: "transparent",
          fontSize: 18,
          height: 40,
          id: "legacy-text",
          kind: "text",
          pageId: "page-1",
          text: "older",
          width: 100,
          x: 100,
          y: 100,
        }],
        schemaVersion: 5,
      },
    });
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("playsay-task-document-surface") || (this.classList.contains("playsay-annotation-layer") && !this.getAttribute("data-anchor-id"))) {
        return domRect({ height: 900, left: 10, top: 20, width: 800 });
      }
      if (this.getAttribute("data-playsay-annotation-anchor-id") === "image-a" || this.getAttribute("data-anchor-id") === "image-a") {
        return domRect({ height: 400, left: 30, top: 70, width: 760 });
      }
      if (this.getAttribute("data-playsay-annotation-anchor-id") === "image-b" || this.getAttribute("data-anchor-id") === "image-b") {
        return domRect({ height: 300, left: 50, top: 510, width: 720 });
      }
      return domRect({ height: 0, left: 0, top: 0, width: 0 });
    });
    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material: flowImageMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));

    await waitFor(() => expect(container.querySelector('foreignObject[aria-label="classroom.annotation.element.text"]')).toBeTruthy());
    const legacyText = container.querySelector<SVGForeignObjectElement>('foreignObject[aria-label="classroom.annotation.element.text"]')!;
    fireEvent.pointerDown(legacyText, { button: 0, clientX: 100, clientY: 110, pointerId: 1 });
    await waitFor(() => expect(apiMocks.saveAnnotation).toHaveBeenCalledWith(
      "lesson-1",
      expect.objectContaining({
        content: expect.objectContaining({
          elements: expect.arrayContaining([expect.objectContaining({ anchorId: "image-a", id: "legacy-text" })]),
        }),
      }),
    ), { timeout: 1_500 });

    rectSpy.mockRestore();
  });

  it("does not let a stale REST annotation replace connected live elements", async () => {
    const setElements = vi.fn();
    apiMocks.fetchAnnotation.mockResolvedValueOnce({
      content: {
        activePageId: "page-1",
        coordinateSpace: "material-page",
        elements: [],
        schemaVersion: 5,
      },
    });

    const { container } = render(createElement(LessonTaskCanvas, {
      annotationSync: {
        elements: [{
          color: "#ff5c00",
          createdAt: 1,
          id: "active-stroke",
          kind: "stroke" as const,
          pageId: "page-1",
          points: [{ pageId: "page-1", x: 10, y: 20 }, { pageId: "page-1", x: 30, y: 40 }],
          strokeWidth: 8 as const,
        }],
        participants: [],
        ready: true,
        setElements,
        updateCursor: vi.fn(),
      },
      lessonId: "lesson-1",
      material,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));

    await waitFor(() => expect(apiMocks.fetchAnnotation).toHaveBeenCalled());
    expect(setElements).not.toHaveBeenCalled();
    expect(container.querySelector("path.playsay-annotation-element")?.getAttribute("d")).toContain("30.0 40.0");
  });

  it("launches an HTML game explicitly and preserves its iframe while minimized", async () => {
    const onPresentationModeChange = vi.fn();
    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material: htmlGameMaterial,
      onPresentationModeChange,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));

    expect(container.querySelector(".playsay-task-board")?.getAttribute("data-presentation-mode")).toBe("default");
    expect(container.querySelector(".playsay-html-game iframe")).toBeNull();

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='html-game-launch-game-1']")!);
    await waitFor(() => expect(container.querySelector(".playsay-task-board")?.getAttribute("data-presentation-mode")).toBe("html-game-focus"));
    await waitFor(() => expect(container.querySelector(".playsay-html-game iframe")).not.toBeNull());
    const iframe = container.querySelector(".playsay-html-game iframe");
    expect(container.querySelector(".playsay-html-game")?.getAttribute("data-fill-available")).toBe("true");

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='material-focus-close']")!);

    expect(container.querySelector(".playsay-task-board")?.getAttribute("data-presentation-mode")).toBe("default");
    expect(container.querySelector(".playsay-html-game iframe")).toBe(iframe);
    expect(container.querySelector(".playsay-material-focused-game")?.getAttribute("data-active")).toBe("false");
    expect(onPresentationModeChange).toHaveBeenLastCalledWith("default");

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='html-game-launch-game-1']")!);

    expect(container.querySelector(".playsay-task-board")?.getAttribute("data-presentation-mode")).toBe("html-game-focus");
    expect(container.querySelector(".playsay-html-game iframe")).toBe(iframe);

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='material-focus-close']")!);
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='html-game-launch-game-2']")!);

    const frames = container.querySelectorAll(".playsay-html-game iframe");
    expect(frames).toHaveLength(2);
    expect(frames[0]).toBe(iframe);
    expect(container.querySelectorAll(".playsay-material-focused-game")[0]?.getAttribute("data-active")).toBe("false");
    expect(container.querySelectorAll(".playsay-material-focused-game")[1]?.getAttribute("data-active")).toBe("true");
  });

  it("opens and closes an HTML game from shared presentation state without echoing open", async () => {
    const setPresentedBlock = vi.fn();
    const sync = htmlGameSync({ presentedBlockId: null, setPresentedBlock });
    const props = {
      htmlGameSync: sync,
      lessonId: "lesson-1",
      material: htmlGameMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    };
    const { container, rerender } = render(createElement(LessonTaskCanvas, props));

    rerender(createElement(LessonTaskCanvas, {
      ...props,
      htmlGameSync: htmlGameSync({ presentedBlockId: "game-1", setPresentedBlock }),
    }));

    await waitFor(() => expect(container.querySelector(".playsay-html-game iframe")).not.toBeNull());
    expect(container.querySelector(".playsay-task-board")?.getAttribute("data-presentation-mode")).toBe("html-game-focus");
    expect(setPresentedBlock).not.toHaveBeenCalledWith("game-1");

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='material-focus-close']")!);
    expect(setPresentedBlock).toHaveBeenCalledWith(null);
  });

  it("does not auto-launch a legacy HTML game after returning to its page", async () => {
    const { container } = render(createElement(LessonTaskCanvas, {
      canControlPages: true,
      lessonId: "lesson-1",
      material: gameAndWorksheetMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));

    expect(container.querySelector(".playsay-task-board")?.getAttribute("data-presentation-mode")).toBe("default");
    const pageButtons = container.querySelectorAll<HTMLButtonElement>(".playsay-page-picker-button");
    fireEvent.click(pageButtons[1]!);
    await waitFor(() => expect(container.querySelector(".playsay-task-board")?.getAttribute("data-presentation-mode")).toBe("default"));
    fireEvent.click(container.querySelectorAll<HTMLButtonElement>(".playsay-page-picker-button")[0]!);

    expect(container.querySelector(".playsay-task-board")?.getAttribute("data-presentation-mode")).toBe("default");
    expect(container.querySelector("[data-testid='html-game-launch-game-1']")).toBeTruthy();
  });

  it("expands a static image only after the user presses the focus button", () => {
    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material: staticImageMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));

    expect(container.querySelector(".playsay-task-board")?.getAttribute("data-presentation-mode")).toBe("default");
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='material-image-focus-image-1']")!);
    expect(container.querySelector(".playsay-task-board")?.getAttribute("data-presentation-mode")).toBe("image-focus");
    expect(container.querySelector("[data-testid='annotation-tool-pen']")).toBeTruthy();
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='material-focus-close']")!);
    expect(container.querySelector(".playsay-task-board")?.getAttribute("data-presentation-mode")).toBe("default");
  });

  it("does not publish a stale default viewport while entering image focus", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(1_000);
    const publish = vi.fn();
    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material: staticImageMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
      viewportSync: {
        clientId: 7,
        publish,
        ready: true,
        state: null,
      },
    }));
    const taskDocument = container.querySelector<HTMLElement>(".playsay-task-document")!;
    taskDocument.scrollTop = 180;
    await waitFor(() => expect(publish).toHaveBeenCalled());
    publish.mockClear();

    fireEvent.scroll(taskDocument);
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='material-image-focus-image-1']")!);

    await waitFor(() => expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      focusedBlockId: "image-1",
      presentationMode: "image-focus",
      scrollContainer: "image",
    })));
    await new Promise((resolve) => window.setTimeout(resolve, 70));
    expect(publish.mock.calls.some(([viewport]) => viewport.presentationMode === "default")).toBe(false);
    performanceNow.mockRestore();
  });

  it("does not echo a delayed DOM scroll event after applying a remote viewport", async () => {
    const publish = vi.fn();
    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material: staticImageMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
      viewportSync: {
        clientId: 7,
        publish,
        ready: true,
        state: {
          materialId: staticImageMaterial.id,
          pageId: "page-static",
          presentationMode: "default",
          revision: 10,
          scrollContainer: "document",
          sourceClientId: 9,
          x: 0,
          y: 0,
        },
      },
    }));
    const taskDocument = container.querySelector<HTMLElement>(".playsay-task-document")!;
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });

    fireEvent.scroll(taskDocument);
    fireEvent.scroll(taskDocument);

    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes an explicit focus close while a remote scroll is still applying", async () => {
    const animationFrames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        animationFrames.push(callback);
        return animationFrames.length;
      });
    const publish = vi.fn();
    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material: staticImageMaterial,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
      viewportSync: {
        clientId: 7,
        publish,
        ready: true,
        state: {
          focusedBlockId: "image-1",
          materialId: staticImageMaterial.id,
          pageId: "page-static",
          presentationMode: "image-focus",
          revision: 10,
          scrollContainer: "image",
          sourceClientId: 9,
          x: 0,
          y: 0.5,
        },
      },
    }));
    const close = await waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>("[data-testid='material-focus-close']");
      expect(button).toBeTruthy();
      return button!;
    });

    fireEvent.click(close);
    await waitFor(() => {
      expect(container.querySelector(".playsay-task-board")?.getAttribute("data-presentation-mode")).toBe("default");
    });
    await act(async () => {
      animationFrames.splice(0).forEach((callback) => callback(0));
      await Promise.resolve();
    });

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      presentationMode: "default",
      scrollContainer: "document",
    }));
    requestAnimationFrame.mockRestore();
  });

  it("draws with the selected line width and returns one-shot shapes to the pointer", async () => {
    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));
    const layer = await annotationLayer(container);
    expect(layer.querySelectorAll("path")).toHaveLength(0);

    fireEvent.click(container.querySelectorAll<HTMLButtonElement>(".playsay-line-width")[2]!);
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='annotation-tool-pen']")!);
    drawPointer(layer, { x: 100, y: 120 }, { x: 300, y: 320 });

    expect(container.querySelector("path.playsay-annotation-element")?.getAttribute("stroke-width")).toBe("16");

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='annotation-tool-rectangle']")!);
    drawPointer(layer, { x: 350, y: 200 }, { x: 600, y: 450 });

    expect(container.querySelector("rect.playsay-annotation-element")).toBeTruthy();
    expect(container.querySelector("[data-testid='annotation-tool-pointer']")?.getAttribute("data-active")).toBe("true");
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='annotation-tool-undo']")!);
    expect(container.querySelector("rect.playsay-annotation-element")).toBeNull();
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='annotation-tool-redo']")!);
    expect(container.querySelector("rect.playsay-annotation-element")).toBeTruthy();
  });

  it("erases a sparse stroke by crossing the middle of its segment while pressed", async () => {
    apiMocks.fetchAnnotation.mockResolvedValue({
      content: {
        activePageId: "page-1",
        coordinateSpace: "material-page",
        elements: [{
          color: "#ff5c00",
          createdAt: 1,
          id: "sparse-stroke",
          kind: "stroke",
          pageId: "page-1",
          points: [
            { pageId: "page-1", x: 100, y: 100 },
            { pageId: "page-1", x: 900, y: 100 },
          ],
          strokeWidth: 8,
        }],
        schemaVersion: 3,
      },
    });
    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));
    const layer = await annotationLayer(container);
    await waitFor(() => expect(container.querySelector("path.playsay-annotation-element")).toBeTruthy());

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='annotation-tool-eraser']")!);
    fireEvent.pointerMove(layer, { clientX: 500, clientY: 100, pointerId: 1 });
    expect(container.querySelector("path.playsay-annotation-element")).toBeTruthy();
    fireEvent.pointerDown(layer, { button: 0, clientX: 500, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(layer, { button: 0, clientX: 500, clientY: 100, pointerId: 1 });

    expect(container.querySelector("path.playsay-annotation-element")).toBeNull();
  });

  it("creates an editable sticky note", async () => {
    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));
    const layer = await annotationLayer(container);

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='annotation-tool-sticky-note']")!);
    fireEvent.pointerDown(layer, { button: 0, clientX: 250, clientY: 260, pointerId: 1 });

    const editor = container.querySelector<HTMLTextAreaElement>(".playsay-annotation-text-stickyNote textarea");
    expect(editor).toBeTruthy();
    fireEvent.change(editor!, { target: { value: "New idea" } });
    fireEvent.blur(editor!);
    expect(container.querySelector(".playsay-annotation-text-stickyNote")?.textContent).toContain("New idea");
  });

  it("changes the default and selected Text font size from the toolbar", async () => {
    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));
    const layer = await annotationLayer(container);

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='annotation-tool-text']")!);
    expect(container.querySelector(".playsay-font-size-controls output")?.textContent).toBe("18");
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='annotation-font-size-decrease']")!);
    fireEvent.pointerDown(layer, { button: 0, clientX: 250, clientY: 260, pointerId: 1 });

    expect(container.querySelector<HTMLElement>(".playsay-annotation-text-text")?.style.fontSize).toBe("14px");
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='annotation-font-size-increase']")!);
    expect(container.querySelector<HTMLElement>(".playsay-annotation-text-text")?.style.fontSize).toBe("18px");
  });

  it("creates a mind map root and adds an automatically connected child with Tab", async () => {
    const { container } = render(createElement(LessonTaskCanvas, {
      lessonId: "lesson-1",
      material,
      onSaveAnswers: () => undefined,
      score: null,
      submission: null,
      submissionMessage: null,
      submissionSaving: false,
      teacherName: "Teacher Demo",
    }));
    const layer = await annotationLayer(container);

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='annotation-tool-mind-map']")!);
    fireEvent.pointerDown(layer, { button: 0, clientX: 500, clientY: 420, pointerId: 1 });
    const rootEditor = container.querySelector<HTMLTextAreaElement>(".playsay-annotation-text-mindMapNode textarea");
    expect(rootEditor).toBeTruthy();
    fireEvent.change(rootEditor!, { target: { value: "Present Simple" } });
    fireEvent.keyDown(rootEditor!, { key: "Tab" });

    expect(container.querySelectorAll(".playsay-annotation-text-mindMapNode")).toHaveLength(2);
    expect(container.querySelector(".playsay-annotation-text-mindMapNode")?.textContent).toContain("Present Simple");
    expect(container.querySelector(".playsay-mind-map-connector")).toBeTruthy();
    expect(container.querySelectorAll(".playsay-annotation-text-mindMapNode textarea")).toHaveLength(1);
    const childNode = container.querySelector<HTMLElement>(".playsay-annotation-text-mindMapNode textarea")?.parentElement;
    expect(childNode?.style.fontSize).toBe("14px");
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='annotation-font-size-increase']")!);
    expect(childNode?.style.fontSize).toBe("18px");
  });
});

function htmlGameSync(overrides: Partial<MaterialHtmlGameSync> = {}): MaterialHtmlGameSync {
  return {
    authorityRuns: {},
    effects: [],
    inputs: [],
    isAuthority: false,
    presentedBlockId: null,
    publishEffect: vi.fn(),
    publishInput: vi.fn(),
    publishSnapshot: vi.fn(),
    ready: true,
    setAuthorityRun: vi.fn(),
    setPresentedBlock: vi.fn(),
    snapshots: {},
    ...overrides,
  };
}

async function annotationLayer(container: HTMLElement): Promise<SVGSVGElement> {
  const layer = await waitFor(() => {
    const element = container.querySelector<SVGSVGElement>(".playsay-annotation-layer");
    expect(element).toBeTruthy();
    return element!;
  });
  Object.defineProperty(layer, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: 1000,
      height: 1000,
      left: 0,
      right: 1000,
      top: 0,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  Object.defineProperty(layer, "setPointerCapture", { configurable: true, value: vi.fn() });
  Object.defineProperty(layer, "hasPointerCapture", { configurable: true, value: vi.fn(() => true) });
  Object.defineProperty(layer, "releasePointerCapture", { configurable: true, value: vi.fn() });
  return layer;
}

function drawPointer(
  layer: SVGSVGElement,
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  fireEvent.pointerDown(layer, { button: 0, clientX: start.x, clientY: start.y, pointerId: 1 });
  fireEvent.pointerMove(layer, { buttons: 1, clientX: end.x, clientY: end.y, pointerId: 1 });
  fireEvent.pointerUp(layer, { button: 0, clientX: end.x, clientY: end.y, pointerId: 1 });
}

function domRect({
  height,
  left,
  top,
  width,
}: {
  height: number;
  left: number;
  top: number;
  width: number;
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}
