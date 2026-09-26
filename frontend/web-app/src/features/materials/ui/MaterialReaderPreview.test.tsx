// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonMaterialAsset } from "../../../shared/api/playsay";
import type { MaterialFormState } from "../model/materialDocument";
import { MaterialReaderPreview } from "./MaterialReaderPreview";

const apiMocks = vi.hoisted(() => ({
  fetchMaterialAssetText: vi.fn(),
  fetchMaterialAssets: vi.fn(),
}));

vi.mock("../../../shared/api/playsay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/api/playsay")>()),
  fetchMaterialAssetText: apiMocks.fetchMaterialAssetText,
  fetchMaterialAssets: apiMocks.fetchMaterialAssets,
}));

vi.mock("../../../shared/i18n", () => ({
  i18n: { t: (key: string) => key },
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const form = {
  id: "material-preview-game",
  updatedAt: "2026-09-14T10:00:00.000Z",
  title: "Donut hunt game",
  description: "",
  language: "en",
  cefrLevel: "A1",
  topicTags: "",
  skillTags: "",
  ageBand: "",
  estimatedDurationMin: "",
  visibility: "PRIVATE",
  status: "DRAFT",
  sourcePrompt: "",
  document: {
    schemaVersion: 1,
    pages: [{
      id: "page-game",
      title: "Game",
      layout: "HTML_GAME",
      blocks: [{
        id: "game-1",
        type: "htmlGame",
        title: "Donut hunt game",
        url: "material-asset:game-asset",
        height: 640,
      }],
    }],
  },
  scoringRubric: {},
  sourceMeta: {},
} satisfies MaterialFormState;

describe("MaterialReaderPreview", () => {
  beforeEach(() => {
    apiMocks.fetchMaterialAssets.mockResolvedValue([{
      id: "game-asset",
      materialId: "material-preview-game",
      kind: "HTML_GAME",
      contentUrl: "/api/materials/material-preview-game/assets/game-asset/content",
      provider: "s3",
      metadata: {},
      createdAt: "2026-09-14T10:00:00.000Z",
    } satisfies LessonMaterialAsset]);
    apiMocks.fetchMaterialAssetText.mockResolvedValue("<html><body><button>Play</button></body></html>");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("gives a launched game a focused preview viewport and preserves it across minimize", async () => {
    const { container } = render(
      <MaterialReaderPreview
        form={form}
        imageGenerationProgress={null}
        message={null}
        onBlockPatch={() => undefined}
        onBlockPatchCommit={() => undefined}
        onUpdateAssetTags={async () => null}
      />,
    );
    const preview = container.querySelector(".playsay-material-reader");

    expect(preview?.getAttribute("data-presentation-mode")).toBe("default");
    await waitFor(() => expect(container.querySelector("[data-testid='html-game-launch-game-1']")).not.toBeNull());
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='html-game-launch-game-1']")!);

    await waitFor(() => expect(container.querySelector(".playsay-html-game iframe")).not.toBeNull());
    expect(preview?.getAttribute("data-presentation-mode")).toBe("html-game-focus");
    expect(container.querySelector(".playsay-html-game")?.getAttribute("data-fill-available")).toBe("true");
    const iframe = container.querySelector(".playsay-html-game iframe");

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='material-focus-close']")!);
    expect(preview?.getAttribute("data-presentation-mode")).toBe("default");
    expect(container.querySelector(".playsay-html-game iframe")).toBe(iframe);

    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-testid='html-game-launch-game-1']")!);
    expect(preview?.getAttribute("data-presentation-mode")).toBe("html-game-focus");
    expect(container.querySelector(".playsay-html-game iframe")).toBe(iframe);
  });

  it("lets the teacher navigate a PDF locally in the library reader", () => {
    apiMocks.fetchMaterialAssets.mockResolvedValue([]);
    const pdfForm: MaterialFormState = {
      ...form,
      id: "material-preview-pdf",
      document: {
        schemaVersion: 1,
        pages: [{
          id: "page-pdf",
          title: "PDF",
          layout: "FLOW",
          blocks: [{
            id: "pdf-1",
            type: "document",
            title: "PDF",
            documentAssetId: "display-asset",
            documentFormat: "PDF",
            documentRevision: "revision-1",
            documentPages: [
              { id: "page-1", index: 0, width: 595, height: 842 },
              { id: "page-2", index: 1, width: 595, height: 842 },
            ],
            documentPdfLayout: "SINGLE",
            documentPdfSeparateCover: true,
          }],
        }],
      },
    };
    const { container } = render(
      <MaterialReaderPreview
        form={pdfForm}
        imageGenerationProgress={null}
        message={null}
        onBlockPatch={() => undefined}
        onBlockPatchCommit={() => undefined}
        onUpdateAssetTags={async () => null}
      />,
    );
    const next = container.querySelector<HTMLButtonElement>('button[aria-label="materials.document.next"]')!;
    const previous = container.querySelector<HTMLButtonElement>('button[aria-label="materials.document.previous"]')!;

    expect(next.disabled).toBe(false);
    expect(previous.disabled).toBe(true);
    fireEvent.click(next);
    expect(previous.disabled).toBe(false);
    expect(container.querySelector('.playsay-document-stage')?.getAttribute('data-playsay-annotation-anchor-id')).toBe('pdf-1:revision-1:1');
  });
});
