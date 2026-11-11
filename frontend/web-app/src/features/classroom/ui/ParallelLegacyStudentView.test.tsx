// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParallelLegacyStudentView } from "./ParallelLegacyStudentView";

const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../../../shared/api/playsay", () => ({ fetchParallelStudentLegacyAnnotations: api.fetch, isApiStatus: (error: { status?: number }, status: number) => error?.status === status }));
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./LessonTaskCanvas", () => ({ LessonTaskCanvas: ({ readOnlyAnnotation }: { readOnlyAnnotation: { elements: { id: string }[] } }) => <div>read-only {readOnlyAnnotation.elements[0]?.id}</div> }));

const material = { id: "material" } as Parameters<typeof ParallelLegacyStudentView>[0]["material"];
const annotation = (id: string) => ({ content: { activePageId: "page", elements: [{ id, kind: "stroke", pageId: "page", points: [{ x: 1, y: 2 }] }] } });

afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("separate student legacy layer", () => {
  it("refreshes the selected student's read-only layer and retains it during an error", async () => {
    api.fetch.mockResolvedValueOnce(annotation("first")).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(annotation("second"));
    render(<ParallelLegacyStudentView lessonId="lesson" material={material} studentSubject="student-a" teacherName="Teacher" />);
    await waitFor(() => expect(screen.getByText("read-only first")).toBeTruthy());
    expect(api.fetch).toHaveBeenCalledWith("lesson", "material", "student-a");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2_100)); });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("read-only first")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "classroom.collaborationRecovery.retry" }));
    await waitFor(() => expect(screen.getByText("read-only second")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not display a previous student's delayed response after switching", async () => {
    let resolveFirst!: (value: unknown) => void;
    api.fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValueOnce(annotation("student-b"));
    const { rerender } = render(<ParallelLegacyStudentView key="a" lessonId="lesson" material={material} studentSubject="student-a" teacherName="Teacher" />);
    rerender(<ParallelLegacyStudentView key="b" lessonId="lesson" material={material} studentSubject="student-b" teacherName="Teacher" />);
    await waitFor(() => expect(screen.getByText("read-only student-b")).toBeTruthy());
    await act(async () => resolveFirst(annotation("student-a")));
    expect(screen.queryByText("read-only student-a")).toBeNull();
  });

  it("removes the visible layer when the teacher's access is revoked", async () => {
    api.fetch.mockResolvedValueOnce(annotation("private")).mockRejectedValueOnce({ status: 403 });
    render(<ParallelLegacyStudentView lessonId="lesson" material={material} studentSubject="student-a" teacherName="Teacher" />);
    await waitFor(() => expect(screen.getByText("read-only private")).toBeTruthy());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2_100)); });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText("read-only private")).toBeNull();
  });
});
