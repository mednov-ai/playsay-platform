// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonMaterial } from "../../../shared/api/playsay";
import type { LessonRoomSession } from "../model/session";
import { useLessonMaterial } from "./useLessonMaterial";

const apiMocks = vi.hoisted(() => ({
  appendHtmlGame: vi.fn(),
  appendImage: vi.fn(),
  fetchMaterial: vi.fn(),
}));

vi.mock("../../../shared/api/playsay", () => ({
  appendScheduledLessonHtmlGamePage: apiMocks.appendHtmlGame,
  appendScheduledLessonImagePage: apiMocks.appendImage,
  fetchScheduledLessonMaterial: apiMocks.fetchMaterial,
}));

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const session = {
  lessonId: "lesson-1",
  materialId: null,
} as LessonRoomSession;

function material(id: string, pageId: string): LessonMaterial {
  return {
    blockCount: 1,
    cefrLevel: "A2",
    createdAt: "2026-07-17T09:00:00Z",
    description: null,
    document: {
      pages: [{ blocks: [], id: pageId, layout: "FLOW", title: "Live page" }],
      schemaVersion: 1,
    },
    id,
    language: "en",
    scoringRubric: { maxScore: 10 },
    sourceMeta: {},
    status: "PUBLISHED",
    title: "Live material",
    updatedAt: "2026-07-17T09:00:00Z",
    visibility: "PRIVATE",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useLessonMaterial live uploads", () => {
  it("applies an uploaded image and its active page as soon as the endpoint resolves", async () => {
    const uploadedMaterial = material("copy-1", "page-image");
    apiMocks.appendImage.mockResolvedValue({
      activePageId: "page-image",
      lesson: { materialId: "copy-1" },
      material: uploadedMaterial,
    });
    const { result } = renderHook(() => useLessonMaterial({ onAssignMaterial: vi.fn(), session }));
    const file = new File(["image"], "long.png", { type: "image/png" });

    await act(async () => {
      await result.current.uploadImagePage(file);
    });

    expect(apiMocks.appendImage).toHaveBeenCalledWith("lesson-1", file, "long.png");
    expect(result.current.material).toBe(uploadedMaterial);
    expect(result.current.liveActivePageId).toBe("page-image");
    expect(result.current.selectedMaterialId).toBe("copy-1");
    expect(result.current.uploadingImagePage).toBe(false);
  });

  it("applies an uploaded HTML game and activates its page without another action", async () => {
    const uploadedMaterial = material("copy-2", "page-game");
    apiMocks.appendHtmlGame.mockResolvedValue({
      activePageId: "page-game",
      lesson: { materialId: "copy-2" },
      material: uploadedMaterial,
    });
    const { result } = renderHook(() => useLessonMaterial({ onAssignMaterial: vi.fn(), session }));
    const file = new File(["<html></html>"], "game.html", { type: "text/html" });

    await act(async () => {
      await result.current.uploadHtmlGamePage(file);
    });

    expect(apiMocks.appendHtmlGame).toHaveBeenCalledWith("lesson-1", file);
    expect(result.current.material).toBe(uploadedMaterial);
    expect(result.current.liveActivePageId).toBe("page-game");
    expect(result.current.selectedMaterialId).toBe("copy-2");
    expect(result.current.uploadingHtmlGamePage).toBe(false);
  });
});
