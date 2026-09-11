// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonMaterial } from "../../../shared/api/playsay";
import type { LessonRoomSession } from "../model/session";
import { useLessonMaterial } from "./useLessonMaterial";
import { ApiError } from "../../../shared/api/errors";

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
  i18n: {
    t: (key: string, options?: { max?: number }) => {
      if (key === "materials.htmlGameUpload.tooLarge") return `Maximum ${options?.max} MB. Try again.`;
      if (key === "materials.htmlGameUpload.networkError") return "Connection interrupted. Try again.";
      if (key === "materials.htmlGameUpload.failed") return "Upload failed. Try again.";
      return key;
    },
  },
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
  it("hides the previous material while a newly assigned material is loading", async () => {
    let resolveSecond: ((value: LessonMaterial) => void) | undefined;
    apiMocks.fetchMaterial
      .mockResolvedValueOnce(material("material-1", "page-1"))
      .mockImplementationOnce(() => new Promise<LessonMaterial>((resolve) => {
        resolveSecond = resolve;
      }));
    const { result, rerender } = renderHook(
      ({ materialId }) => useLessonMaterial({
        onAssignMaterial: vi.fn(),
        session: {
          ...session,
          lessonUpdatedAt: "2026-07-17T09:00:00Z",
          materialId,
        },
      }),
      { initialProps: { materialId: "material-1" } },
    );

    await waitFor(() => expect(result.current.material?.id).toBe("material-1"));
    rerender({ materialId: "material-2" });

    await waitFor(() => expect(result.current.material).toBeNull());
    await act(async () => resolveSecond?.(material("material-2", "page-2")));
    await waitFor(() => expect(result.current.material?.id).toBe("material-2"));
  });

  it("reloads the same lesson-only material after every realtime lesson revision", async () => {
    const firstRevision = material("copy-live", "page-image-1");
    const secondRevision = {
      ...material("copy-live", "page-image-2"),
      document: {
        pages: [
          { blocks: [], id: "page-image-1", layout: "STATIC_IMAGE", title: "Long image" },
          { blocks: [], id: "page-image-2", layout: "STATIC_IMAGE", title: "Wide image" },
        ],
        schemaVersion: 1,
      },
    } satisfies LessonMaterial;
    apiMocks.fetchMaterial
      .mockResolvedValueOnce(firstRevision)
      .mockResolvedValueOnce(secondRevision);
    const { result, rerender } = renderHook(
      ({ lessonUpdatedAt }) => useLessonMaterial({
        onAssignMaterial: vi.fn(),
        session: {
          ...session,
          lessonUpdatedAt,
          materialId: "copy-live",
        },
      }),
      { initialProps: { lessonUpdatedAt: "2026-07-17T09:00:00Z" } },
    );

    await waitFor(() => expect(result.current.material).toBe(firstRevision));
    rerender({ lessonUpdatedAt: "2026-07-17T09:01:00Z" });

    await waitFor(() => expect(result.current.material).toBe(secondRevision));
    expect(apiMocks.fetchMaterial).toHaveBeenCalledTimes(2);
  });

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

  it("settles an oversized upload before calling the API and permits retry", async () => {
    const { result } = renderHook(() => useLessonMaterial({ onAssignMaterial: vi.fn(), session }));
    const oversized = { name: "large.html", size: 20 * 1024 * 1024 + 1, type: "text/html" } as File;

    await act(async () => {
      await result.current.uploadHtmlGamePage(oversized);
    });

    expect(apiMocks.appendHtmlGame).not.toHaveBeenCalled();
    expect(result.current.uploadingHtmlGamePage).toBe(false);
    expect(result.current.assignmentMessage).toContain("20");

    apiMocks.appendHtmlGame.mockResolvedValue({
      activePageId: "page-game",
      lesson: { materialId: "copy-2" },
      material: material("copy-2", "page-game"),
    });
    await act(async () => {
      await result.current.uploadHtmlGamePage(new File(["<html></html>"], "retry.html", { type: "text/html" }));
    });
    expect(apiMocks.appendHtmlGame).toHaveBeenCalledTimes(1);
  });

  it("settles proxy 413 and network failures without replacing the active material", async () => {
    apiMocks.fetchMaterial.mockResolvedValue(material("current", "page-current"));
    apiMocks.appendHtmlGame
      .mockRejectedValueOnce(new ApiError(413, "HTTP_ERROR", "HTTP 413"))
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "raw network error"));
    const { result } = renderHook(() => useLessonMaterial({
      onAssignMaterial: vi.fn(),
      session: { ...session, materialId: "current" },
    }));
    await waitFor(() => expect(result.current.material?.id).toBe("current"));
    const file = new File(["<html></html>"], "game.html", { type: "text/html" });

    await act(async () => { await result.current.uploadHtmlGamePage(file); });
    expect(result.current.assignmentMessage).toContain("20");
    expect(result.current.material?.id).toBe("current");
    expect(result.current.uploadingHtmlGamePage).toBe(false);

    await act(async () => { await result.current.uploadHtmlGamePage(file); });
    expect(result.current.assignmentMessage).not.toContain("raw network error");
    expect(result.current.material?.id).toBe("current");
    expect(result.current.uploadingHtmlGamePage).toBe(false);
  });

  it("ignores completion from an upload attempt after unmount", async () => {
    let resolveUpload: ((value: { activePageId: string; lesson: { materialId: string }; material: LessonMaterial }) => void) | undefined;
    apiMocks.appendHtmlGame.mockImplementation(() => new Promise((resolve) => {
      resolveUpload = resolve;
    }));
    const { result, unmount } = renderHook(() => useLessonMaterial({ onAssignMaterial: vi.fn(), session }));
    const pending = result.current.uploadHtmlGamePage(new File(["<html></html>"], "game.html", { type: "text/html" }));

    unmount();
    await act(async () => {
      resolveUpload?.({ activePageId: "late", lesson: { materialId: "late" }, material: material("late", "late") });
      await pending;
    });

    expect(await pending).toBeNull();
  });
});
