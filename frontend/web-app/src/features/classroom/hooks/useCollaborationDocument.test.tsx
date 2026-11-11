// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollaborationDocument } from "../../../shared/api/playsay";
import { useCollaborationDocument } from "./useCollaborationDocument";

const apiMocks = vi.hoisted(() => ({
  createCurrent: vi.fn(),
  createParallel: vi.fn(),
  finalize: vi.fn(),
  saveSnapshot: vi.fn(),
}));
const i18nMocks = vi.hoisted(() => ({
  t: (key: string) => key,
}));

vi.mock("../../../shared/api/playsay", () => ({
  createCurrentCollaborationDocument: apiMocks.createCurrent,
  createParallelStudentCollaborationDocument: apiMocks.createParallel,
  finalizeCollaborationDocument: apiMocks.finalize,
  saveCollaborationDocumentSnapshot: apiMocks.saveSnapshot,
}));

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: i18nMocks.t }),
}));

function collaborationDocument(id: string, materialId: string): CollaborationDocument {
  return {
    createdAt: "2026-07-27T12:00:00Z",
    documentKind: "MATERIAL_WORK",
    id,
    lessonId: "lesson-1",
    materialId,
    scope: "GROUP",
    updatedAt: "2026-07-27T12:00:00Z",
    version: 0,
    yjsDocumentId: `yjs-${id}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useCollaborationDocument", () => {
  it("never exposes a document belonging to the previous material", async () => {
    let resolveNext: ((value: CollaborationDocument) => void) | undefined;
    apiMocks.createCurrent
      .mockResolvedValueOnce(collaborationDocument("document-1", "material-1"))
      .mockImplementationOnce(() => new Promise<CollaborationDocument>((resolve) => {
        resolveNext = resolve;
      }));
    const { result, rerender } = renderHook(
      ({ materialId }) => useCollaborationDocument({
        lessonId: "lesson-1",
        materialId,
        mode: "group",
      }),
      { initialProps: { materialId: "material-1" } },
    );

    await waitFor(() => expect(result.current.document?.id).toBe("document-1"));
    rerender({ materialId: "material-2" });
    await waitFor(() => expect(result.current.document).toBeNull());

    await act(async () => resolveNext?.(collaborationDocument("document-2", "material-2")));
    await waitFor(() => expect(result.current.document?.id).toBe("document-2"));
  });

  it("never shows the previous student's document while switching focus on the same material", async () => {
    let resolveNext: ((value: CollaborationDocument) => void) | undefined;
    const forStudent = (id: string, studentSubject: string) => ({ ...collaborationDocument(id, "material-1"), scope: "INDIVIDUAL", studentSubject });
    apiMocks.createParallel.mockResolvedValueOnce(forStudent("doc-a", "student-a"))
      .mockImplementationOnce(() => new Promise<CollaborationDocument>((resolve) => { resolveNext = resolve; }));
    const { result, rerender } = renderHook(
      ({ studentSubject }) => useCollaborationDocument({ lessonId: "lesson-1", materialId: "material-1", mode: "individual", studentSubject }),
      { initialProps: { studentSubject: "student-a" } },
    );
    await waitFor(() => expect(result.current.document?.id).toBe("doc-a"));
    rerender({ studentSubject: "student-b" });
    expect(result.current.document).toBeNull();
    await act(async () => resolveNext?.(forStudent("doc-b", "student-b")));
    await waitFor(() => expect(result.current.document?.id).toBe("doc-b"));
    expect(apiMocks.createParallel).toHaveBeenLastCalledWith("lesson-1", "material-1", "student-b");
  });

  it("replaces an invalid document instead of reconnecting to the same id", async () => {
    apiMocks.createCurrent
      .mockResolvedValueOnce(collaborationDocument("document-old", "material-1"))
      .mockResolvedValueOnce(collaborationDocument("document-new", "material-1"));
    const { result } = renderHook(() => useCollaborationDocument({
      lessonId: "lesson-1",
      materialId: "material-1",
      mode: "group",
    }));

    await waitFor(() => expect(result.current.document?.id).toBe("document-old"));
    act(() => result.current.invalidateDocument("document-old"));
    await waitFor(() => expect(result.current.document?.id).toBe("document-new"));
    expect(apiMocks.createCurrent).toHaveBeenCalledTimes(2);
  });
});
