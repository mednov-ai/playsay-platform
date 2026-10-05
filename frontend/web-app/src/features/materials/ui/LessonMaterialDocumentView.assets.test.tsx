// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type { LessonMaterial, LessonMaterialAsset } from "../../../shared/api/playsay";
import { i18n } from "../../../shared/i18n";
import { LessonMaterialDocumentView, MATERIAL_ASSET_LOAD_TIMEOUT_MS } from "./LessonMaterialDocumentView";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

const apiMocks = vi.hoisted(() => ({
  fetchMaterialAssetObjectUrl: vi.fn(),
  fetchMaterialAssetText: vi.fn(),
  fetchMaterialAssets: vi.fn(),
}));

vi.mock("../../../shared/api/playsay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/api/playsay")>()),
  fetchMaterialAssetObjectUrl: apiMocks.fetchMaterialAssetObjectUrl,
  fetchMaterialAssetText: apiMocks.fetchMaterialAssetText,
  fetchMaterialAssets: apiMocks.fetchMaterialAssets,
}));

const now = "2026-07-25T08:00:00.000Z";
const assets = ["good", "broken"].map((id) => ({
  id,
  materialId: "material-1",
  kind: "UPLOADED_IMAGE",
  contentUrl: `/api/materials/material-1/assets/${id}/content`,
  provider: "s3",
  metadata: {},
  createdAt: now,
})) satisfies LessonMaterialAsset[];
const material = {
  id: "material-1",
  title: "Image homework",
  description: null,
  language: "en",
  cefrLevel: "A2",
  visibility: "PRIVATE",
  status: "PUBLISHED",
  document: {
    schemaVersion: 1,
    pages: [{
      id: "page-1",
      title: "Pictures",
      layout: "FLOW",
      blocks: [
        { id: "image-good", type: "image", title: "Good image", url: "material-asset:good" },
        { id: "image-broken", type: "image", title: "Broken image", url: "material-asset:broken" },
      ],
    }],
  },
  sourceMeta: {},
  scoringRubric: {},
  topicTags: [],
  skillTags: [],
  blockCount: 2,
  createdAt: now,
  updatedAt: now,
} satisfies LessonMaterial;

describe("LessonMaterialDocumentView asset failures", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("ru");
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchMaterialAssets.mockResolvedValue(assets);
  });

  afterEach(cleanup);

  it("keeps successful images, hides internal references and retries failed files", async () => {
    let brokenAvailable = false;
    apiMocks.fetchMaterialAssetObjectUrl.mockImplementation(async (_materialId: string, assetId: string) => {
      if (assetId === "broken" && !brokenAvailable) {
        throw new Error("asset unavailable");
      }
      return `blob:${assetId}`;
    });
    const { container } = render(
      <AppProviders>
        <LessonMaterialDocumentView material={material} />
      </AppProviders>,
    );

    await waitFor(() => expect(screen.getByText("Часть файлов материала не загрузилась.")).toBeInTheDocument());
    expect(container.querySelector('img[src="blob:good"]')).toBeInTheDocument();
    expect(container.textContent).not.toContain("material-asset:");

    brokenAvailable = true;
    fireEvent.click(screen.getByRole("button", { name: "Загрузить снова" }));

    await waitFor(() => expect(container.querySelector('img[src="blob:broken"]')).toBeInTheDocument());
    expect(screen.queryByText("Часть файлов материала не загрузилась.")).not.toBeInTheDocument();
  });

  it("discards a late object URL after switching materials", async () => {
    let finishOldLoad: ((url: string) => void) | undefined;
    apiMocks.fetchMaterialAssets.mockImplementation(async (materialId: string) => [
      { ...assets[0], id: materialId === "material-1" ? "good" : "new", materialId },
    ]);
    apiMocks.fetchMaterialAssetObjectUrl.mockImplementation((_materialId: string, assetId: string) => (
      assetId === "good"
        ? new Promise<string>((resolve) => { finishOldLoad = resolve; })
        : Promise.resolve("blob:new")
    ));
    const nextMaterial = {
      ...material,
      id: "material-2",
      document: {
        schemaVersion: 1,
        pages: [{
          id: "page-2",
          title: "Next",
          layout: "FLOW",
          blocks: [{ id: "image-new", type: "image", title: "New image", url: "material-asset:new" }],
        }],
      },
    } satisfies LessonMaterial;
    const view = render(<AppProviders><LessonMaterialDocumentView material={material} /></AppProviders>);
    await waitFor(() => expect(finishOldLoad).toBeDefined());

    view.rerender(<AppProviders><LessonMaterialDocumentView material={nextMaterial} /></AppProviders>);
    await waitFor(() => expect(view.container.querySelector('img[src="blob:new"]')).toBeInTheDocument());
    await act(async () => { finishOldLoad?.("blob:old"); });

    expect(view.container.querySelector('img[src="blob:old"]')).not.toBeInTheDocument();
    expect(view.container.querySelector('img[src="blob:new"]')).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:old");
  });

  it("settles a stalled HTML game load and lets the teacher retry", async () => {
    vi.useFakeTimers();
    apiMocks.fetchMaterialAssets.mockResolvedValue([{
      id: "game-asset",
      materialId: "material-game",
      kind: "HTML_GAME",
      contentUrl: "/api/materials/material-game/assets/game-asset/content",
      provider: "s3",
      metadata: {},
      createdAt: now,
    } satisfies LessonMaterialAsset]);
    let resolveGame: ((html: string) => void) | undefined;
    apiMocks.fetchMaterialAssetText.mockImplementation(() => new Promise<string>((resolve) => {
      resolveGame = resolve;
    }));
    const gameMaterial = {
      ...material,
      id: "material-game",
      title: "Game",
      blockCount: 1,
      document: {
        schemaVersion: 1,
        pages: [{
          id: "page-game",
          title: "Game",
          layout: "FLOW",
          blocks: [{ id: "game", type: "htmlGame", title: "Word race", url: "material-asset:game-asset" }],
        }],
      },
    } satisfies LessonMaterial;
    const view = render(
      <AppProviders>
        <LessonMaterialDocumentView material={gameMaterial} />
      </AppProviders>,
    );

    await act(async () => Promise.resolve());
    expect(view.getByTestId("html-game-loading-game")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MATERIAL_ASSET_LOAD_TIMEOUT_MS);
    });
    expect(view.getByTestId("html-game-unavailable-game")).toBeInTheDocument();
    expect(view.queryByTestId("html-game-launch-game")).not.toBeInTheDocument();
    expect(screen.getByText("Не удалось загрузить файлы материала.")).toBeInTheDocument();

    apiMocks.fetchMaterialAssetText.mockResolvedValue("<html><body>ready</body></html>");
    fireEvent.click(screen.getByRole("button", { name: "Загрузить снова" }));
    await act(async () => Promise.resolve());
    expect(view.getByTestId("html-game-launch-game")).toBeInTheDocument();

    resolveGame?.("<html><body>stale</body></html>");
    vi.useRealTimers();
  });
  function setupGame() {
    apiMocks.fetchMaterialAssets.mockResolvedValue([{ ...assets[0], id: "game-asset", kind: "HTML_GAME" }]);
    apiMocks.fetchMaterialAssetText.mockResolvedValue("<html><body>running</body></html>");
    return { ...material, document: { schemaVersion: 1, pages: [{ id: "page-game", title: "Game", layout: "FLOW", blocks: [{ id: "game", type: "htmlGame", title: "Word race", url: "material-asset:game-asset" }] }] } } satisfies LessonMaterial;
  }

  it("explicit exit destroys the local game iframe instead of hiding it", async () => {
    const gameMaterial = setupGame();
    const view = render(<AppProviders><LessonMaterialDocumentView material={gameMaterial} /></AppProviders>);
    fireEvent.click(await screen.findByTestId("html-game-launch-game"));
    expect(view.container.querySelector("iframe")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Завершить игру" }));
    expect(view.container.querySelector("iframe")).not.toBeInTheDocument();
  });

  it("keeps shared minimize local when parent material and shared state refresh", async () => {
    const gameMaterial = setupGame();
    const sync = {
      authorityRuns: { game: "run-a" }, clientId: 1, effects: [], inputs: [], isAuthority: true,
      presentedBlockId: "game", ready: true, publishEffect: vi.fn(), publishInput: vi.fn(),
      publishSnapshot: vi.fn(), setAuthorityRun: vi.fn(), setPresentedBlock: vi.fn(), snapshots: {},
    };
    const view = render(<AppProviders><LessonMaterialDocumentView material={gameMaterial} htmlGameSync={sync} /></AppProviders>);
    await screen.findByTestId("html-game-launch-game");
    fireEvent.click(screen.getByTestId("material-focus-close"));
    expect(sync.setPresentedBlock).not.toHaveBeenCalled();
    view.rerender(<AppProviders><LessonMaterialDocumentView material={{ ...gameMaterial, document: structuredClone(gameMaterial.document) }} htmlGameSync={{ ...sync }} /></AppProviders>);
    expect(view.container.querySelector('.playsay-material-focus-stack[data-active="true"]')).not.toBeInTheDocument();
    expect(view.container.querySelector("iframe")).toBeInTheDocument();
  });

  it.each(["ru", "en", "de", "fr"])("provides distinct accessible minimize and exit in %s", async (locale) => {
    await i18n.changeLanguage(locale);
    try {
      const gameMaterial = setupGame();
      const view = render(<AppProviders><LessonMaterialDocumentView material={gameMaterial} /></AppProviders>);
      fireEvent.click(await screen.findByTestId("html-game-launch-game"));
      const stopName = i18n.t("materials.renderer.stopGame");
      expect(stopName).not.toBe("materials.renderer.stopGame");
      expect(screen.getByRole("button", { name: stopName })).toBeInTheDocument();
      expect(screen.getByTestId("material-focus-close")).toHaveAttribute("aria-label", i18n.t("materials.renderer.closeGame"));
      fireEvent.click(screen.getByRole("button", { name: stopName }));
      expect(view.container.querySelector("iframe")).not.toBeInTheDocument();
    } finally { await i18n.changeLanguage("ru"); }
  });

});
