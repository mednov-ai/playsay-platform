// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnallocatedAnnotationsHistory } from "./UnallocatedAnnotationsHistory";

const api = vi.hoisted(() => ({ list: vi.fn(), material: vi.fn() }));
vi.mock("../../../shared/api/playsay", () => ({
  fetchUnallocatedAnnotationMaterials: api.list,
  fetchMaterial: api.material,
  isApiStatus: (error: { status?: number }, status: number) => error?.status === status,
}));
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string, options?: { number?: number }) => options?.number ? `${key} ${options.number}` : key }) }));
vi.mock("../../classroom/ui/UnallocatedAnnotationArchive", () => ({ UnallocatedAnnotationArchive: ({ materialId, material }: { materialId: string; material: { id: string } | null }) => <div>archive {materialId} {material?.id ?? "no background"}</div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("teacher history after unassignment", () => {
  it("discovers retained materials and still displays the archive when its original material is unavailable", async () => {
    api.list.mockResolvedValue({ materialIds: ["old"], hasNext: false });
    api.material.mockRejectedValue({ status: 404 });
    render(<UnallocatedAnnotationsHistory lessonId="lesson" materials={[]} teacherName="Teacher" />);
    expect(api.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("classroom.unallocatedAnnotations.open"));
    fireEvent.click(await screen.findByRole("button", { name: "classroom.unallocatedAnnotations.materialNumber 1" }));
    await waitFor(() => expect(screen.getByText("archive old no background")).toBeTruthy());
    expect(api.list).toHaveBeenCalledWith("lesson", 0);
    expect(api.material).toHaveBeenCalledWith("old");
  });

  it("does not show one material as the background of another while switching", async () => {
    let resolveFirst!: (value: unknown) => void;
    api.list.mockResolvedValue({ materialIds: ["a", "b"], hasNext: false });
    api.material.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValueOnce({ id: "b" });
    render(<UnallocatedAnnotationsHistory lessonId="lesson" materials={[]} teacherName="Teacher" />);
    fireEvent.click(screen.getByText("classroom.unallocatedAnnotations.open"));
    fireEvent.click(await screen.findByRole("button", { name: "classroom.unallocatedAnnotations.materialNumber 1" }));
    fireEvent.click(screen.getByRole("button", { name: "classroom.unallocatedAnnotations.materialNumber 2" }));
    await waitFor(() => expect(screen.getByText("archive b b")).toBeTruthy());
    await act(async () => resolveFirst({ id: "a" }));
    expect(screen.queryByText("archive b a")).toBeNull();
    expect(screen.getByText("archive b b")).toBeTruthy();
  });
});
