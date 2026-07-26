// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type { LessonMaterial, LessonMaterialAsset } from "../../../shared/api/playsay";
import { i18n } from "../../../shared/i18n";
import { LessonMaterialDocumentView } from "./LessonMaterialDocumentView";

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
});
