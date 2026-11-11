// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParallelTeacherWorkspace } from "./ParallelTeacherWorkspace";

const api = vi.hoisted(() => ({ fetch: vi.fn(), snapshots: vi.fn() }));
vi.mock("../../../shared/api/playsay", () => ({ fetchUnallocatedParallelMaterialAnnotations: api.fetch, fetchUnallocatedParallelAnnotationSnapshots: api.snapshots,
  isApiStatus: (error: { status?: number }, status: number) => error?.status === status }));
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./StudentLiveWorkspace", () => ({ StudentLiveWorkspace: () => <div>student workspace</div> }));
vi.mock("./LessonTaskCanvas", () => ({ LessonTaskCanvas: ({ readOnlyAnnotation }: { readOnlyAnnotation: { elements: { id: string }[] } }) => <div>archive {readOnlyAnnotation.elements[0]?.id}</div> }));

const props = {
  canViewUnallocated: true, displayName: "Teacher", lessonId: "lesson-1", material: { id: "material-1" },
  onSaveAnswers: vi.fn(), parallelWork: true, score: null, submission: null,
  submissionMessage: null, submissionSaving: false, teacherName: "Teacher", teacherSubject: "teacher-1",
} as unknown as ComponentProps<typeof ParallelTeacherWorkspace>;

beforeEach(() => { vi.clearAllMocks(); api.snapshots.mockResolvedValue({ items: [], hasNext: false }); });
afterEach(cleanup);

describe("parallel teacher unallocated annotations", () => {
  it("shows historical data separately and returns to the student's workspace", async () => {
    api.fetch.mockResolvedValue({ content: { activePageId: "page-1", elements: [{ id: "old", kind: "stroke", pageId: "page-1", color: "#000", points: [{ x: 1, y: 2 }], strokeWidth: 4, createdAt: 1 }] } });
    render(<ParallelTeacherWorkspace {...props} />);
    expect(screen.getByText("student workspace")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.open" }));
    await waitFor(() => expect(screen.getByText("archive old")).toBeTruthy());
    expect(api.fetch).toHaveBeenCalledWith("lesson-1", "material-1");
    expect(screen.getByText("student workspace").parentElement?.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.back" }));
    expect(screen.getByText("student workspace")).toBeTruthy();
    expect(screen.queryByText("archive old")).toBeNull();
  });

  it("keeps retained old-tab snapshots separate from the original historical record", async () => {
    const stroke = (id: string) => ({ id, kind: "stroke", pageId: "page-1", color: "#000", points: [{ x: 1, y: 2 }], strokeWidth: 4, createdAt: 1 });
    api.fetch.mockResolvedValue({ id: "original", content: { activePageId: "page-1", elements: [stroke("old")] } });
    api.snapshots.mockResolvedValue({ items: [{ id: "snapshot", content: { activePageId: "page-1", elements: [stroke("recovered")] } }], hasNext: false });
    render(<ParallelTeacherWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.open" }));
    await waitFor(() => expect(screen.getByText("archive old")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.next" }));
    expect(screen.getByText("archive recovered")).toBeTruthy();
    expect(screen.queryByText("archive old")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.previous" }));
    expect(screen.getByText("archive old")).toBeTruthy();
  });

  it("loads further retained snapshots only when requested", async () => {
    const content = (id: string) => ({ activePageId: "page-1", elements: [{ id, kind: "stroke", pageId: "page-1", points: [{ x: 1, y: 2 }] }] });
    api.fetch.mockResolvedValue({ id: "original", content: content("old") });
    api.snapshots.mockResolvedValueOnce({ items: [], hasNext: true })
      .mockResolvedValueOnce({ items: [{ id: "later", content: content("later") }], hasNext: false });
    render(<ParallelTeacherWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.open" }));
    await waitFor(() => expect(screen.getByText("archive old")).toBeTruthy());
    expect(api.snapshots).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.next" }));
    await waitFor(() => expect(screen.getByText("archive later")).toBeTruthy());
    expect(api.snapshots).toHaveBeenLastCalledWith("lesson-1", "material-1", 1);
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.previous" }));
    await waitFor(() => expect(screen.getByText("archive old")).toBeTruthy());
    expect(api.snapshots).toHaveBeenLastCalledWith("lesson-1", "material-1", 0);
  });

  it("does not reopen an archive after a pending request is closed", async () => {
    let resolve!: (value: null) => void;
    api.fetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(<ParallelTeacherWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.open" }));
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.back" }));
    await act(async () => resolve(null));
    expect(screen.getByText("student workspace")).toBeTruthy();
    expect(screen.queryByText("classroom.unallocatedAnnotations.empty")).toBeNull();
  });

  it("does not offer or show the archive when teacher permission is absent", () => {
    render(<ParallelTeacherWorkspace {...props} canViewUnallocated={false} />);
    expect(screen.queryByRole("button", { name: "classroom.unallocatedAnnotations.open" })).toBeNull();
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("reports unavailable archive data and permits retry", async () => {
    api.fetch.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce(null);
    render(<ParallelTeacherWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.open" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "classroom.collaborationRecovery.retry" }));
    await waitFor(() => expect(screen.getByText("classroom.unallocatedAnnotations.empty")).toBeTruthy());
  });

  it("clears displayed archive contents if access is revoked while loading another page", async () => {
    const content = { activePageId: "page-1", elements: [{ id: "old", kind: "stroke", pageId: "page-1", points: [{ x: 1, y: 2 }] }] };
    api.fetch.mockResolvedValue({ id: "original", content });
    api.snapshots.mockResolvedValueOnce({ items: [], hasNext: true }).mockRejectedValueOnce({ status: 403 });
    render(<ParallelTeacherWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.open" }));
    await waitFor(() => expect(screen.getByText("archive old")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.next" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("archive old")).toBeNull();
  });
});
