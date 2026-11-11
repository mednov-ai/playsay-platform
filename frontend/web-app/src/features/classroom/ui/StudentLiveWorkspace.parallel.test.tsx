// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentLiveWorkspace } from "./StudentLiveWorkspace";

const mocks = vi.hoisted(() => ({
  document: vi.fn(), canvas: vi.fn(), cursor: vi.fn(), invalidate: vi.fn(),
}));
vi.mock("../hooks/useCollaborationDocument", () => ({ useCollaborationDocument: mocks.document }));
vi.mock("../hooks/useExternalActivitySession", () => ({ useExternalActivitySession: () => ({}) }));
vi.mock("../hooks/useYjsWorkspace", () => ({ useYjsWorkspace: () => ({
  annotationUndoState: { canRedo: false, canUndo: false }, participants: [{ name: "Student" }], connected: true,
  reconnectCount: 0, retryConnection: vi.fn(), redoAnnotation: vi.fn(), undoAnnotation: vi.fn(),
  annotationElements: [], setAnnotationElements: vi.fn(), status: "connected", updateCursor: mocks.cursor,
  htmlGameSync: () => ({}), workspaceClientId: 1, setMaterialViewport: vi.fn(), materialViewport: null,
  externalActivityRealtime: null, exerciseSync: {}, videoSync: {},
}) }));
vi.mock("../../materials", () => ({ materialDocumentBlocks: () => [] }));
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./LessonTaskCanvas", () => ({ LessonTaskCanvas: (props: unknown) => { mocks.canvas(props); return <div>canvas</div>; } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props = { displayName: "Teacher", lessonId: "lesson", material: { id: "material" }, profileSubject: "teacher",
  studentSubject: "student-a", parallelWork: true, score: null, submission: null, submissionMessage: null,
  submissionSaving: false, teacherName: "Teacher", teacherSubject: "teacher", onSaveAnswers: vi.fn(),
} as unknown as ComponentProps<typeof StudentLiveWorkspace>;

describe("parallel live workspace", () => {
  it("uses the selected student's room and limits presence to that context", () => {
    mocks.document.mockReturnValue({ document: { id: "doc-a" }, invalidateDocument: mocks.invalidate });
    render(<StudentLiveWorkspace {...props} />);
    expect(mocks.document).toHaveBeenCalledWith(expect.objectContaining({ mode: "individual", studentSubject: "student-a" }));
    const canvas = mocks.canvas.mock.calls.at(-1)?.[0];
    expect(canvas.annotationSync.participants).toEqual([{ name: "Student" }]);
    expect(canvas.annotationSync.updateCursor).toBe(mocks.cursor);
    expect(canvas.viewportSync).toBeUndefined();
    expect(canvas.exerciseSync).toBeUndefined();
  });

  it("does not fall back to a legacy layer while an individual room is unavailable", () => {
    mocks.document.mockReturnValue({ document: null, error: "unavailable", refresh: vi.fn(), invalidateDocument: mocks.invalidate });
    render(<StudentLiveWorkspace {...props} />);
    expect(screen.getByRole("alert").textContent).toContain("unavailable");
    expect(mocks.canvas).not.toHaveBeenCalled();
  });
});
