// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonMaterial } from "../../../shared/api/playsay";
import { MaterialPlayPreviewDialog } from "./MaterialPlayPreviewDialog";

vi.mock("../../../shared/i18n", () => {
  const translate = (key: string) => ({
    "materials.playPreview.close": "Закрыть",
    "materials.playPreview.reset": "Сбросить ответы",
  }[key] ?? key);
  return {
    i18n: { t: translate },
    supportedLanguages: ["ru", "en", "de", "fr"],
    useAppTranslation: () => ({ t: translate }),
  };
});

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

const gameOnlyMaterial = {
  ...material,
  id: "preview",
  title: "Games collection",
  document: {
    schemaVersion: 1,
    pages: [{
      id: "page-games",
      title: "Games",
      layout: "FLOW",
      blocks: [{
        id: "game-1",
        type: "htmlGame",
        title: "Pair Up!",
        url: "material-asset:asset-game",
        height: 640,
      }],
    }],
  },
  blockCount: 1,
} satisfies LessonMaterial;

afterEach(cleanup);

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

  it("hides answer reset for a game-only material and expands the focused game workspace", async () => {
    const { container } = render(createElement(MaterialPlayPreviewDialog, {
      material: gameOnlyMaterial,
      onClose: () => undefined,
      open: true,
    }));

    const dialog = container.querySelector(".playsay-material-play-dialog");
    expect(dialog?.getAttribute("data-presentation-mode")).toBe("default");
    expect(container.querySelector("[data-testid='material-preview-reset']")).toBeNull();

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='html-game-launch-game-1']")!);
    await waitFor(() => expect(dialog?.getAttribute("data-presentation-mode")).toBe("html-game-focus"));

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='material-focus-close']")!);
    await waitFor(() => expect(dialog?.getAttribute("data-presentation-mode")).toBe("default"));
  });

  it("keeps answer reset for exercises and clears the current answers", () => {
    const { container } = render(createElement(MaterialPlayPreviewDialog, {
      material,
      onClose: () => undefined,
      open: true,
    }));
    const input = container.querySelector<HTMLInputElement>(".playsay-inline-answer input")!;

    fireEvent.change(input, { target: { value: "learning" } });
    expect(input.value).toBe("learning");

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='material-preview-reset']")!);
    expect(input.value).toBe("");
  });
});
