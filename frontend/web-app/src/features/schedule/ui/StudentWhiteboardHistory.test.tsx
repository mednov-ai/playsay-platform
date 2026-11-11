// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeAppLanguage } from "../../../shared/i18n";
import { StudentWhiteboardHistory } from "./StudentWhiteboardHistory";

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../../../shared/api/whiteboard", () => ({ fetchWhiteboardLibraryPage: api.list }));
vi.mock("../../classroom/ui/SavedWhiteboardDialog", () => ({
  SavedWhiteboardDialog: ({ lessonId, boardId, onClose }: { lessonId: string; boardId: string; onClose: () => void }) => (
    <div role="dialog" data-lesson={lessonId} data-board={boardId}><button onClick={onClose} type="button">Close</button></div>
  ),
}));

beforeEach(async () => {
  api.list.mockReset();
  await changeAppLanguage("en");
});
afterEach(cleanup);

describe("student whiteboard history", () => {
  it.each([
    ["ru", "История досок"], ["en", "Saved whiteboards"], ["de", "Gespeicherte Tafeln"], ["fr", "Tableaux enregistrés"],
  ])("shows a discoverable history entry in %s", async (language, label) => {
    await changeAppLanguage(language);
    render(<StudentWhiteboardHistory />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("loads only after opening and opens the authorized board in the saved-board dialog", async () => {
    api.list.mockResolvedValue({ items: [{ id: "board-a", lessonId: "lesson-a", title: "Synthetic lesson", createdAt: "2026-11-11T10:00:00Z" }], total: 1 });
    render(<StudentWhiteboardHistory />);
    expect(api.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Saved whiteboards"));
    fireEvent.click(await screen.findByRole("button", { name: /Synthetic lesson/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("data-lesson", "lesson-a");
    expect(dialog).toHaveAttribute("data-board", "board-a");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it.each([
    ["ru", "История досок", "Страницы истории досок", "Далее"],
    ["en", "Saved whiteboards", "Whiteboard history pages", "Next"],
    ["de", "Gespeicherte Tafeln", "Seiten des Tafelverlaufs", "Weiter"],
    ["fr", "Tableaux enregistrés", "Pages des tableaux enregistrés", "Suivant"],
  ])("localizes history paging in %s", async (language, title, navigationLabel, nextLabel) => {
    await changeAppLanguage(language);
    api.list.mockResolvedValue({ items: [{ id: "board-a", lessonId: "lesson-a", title: "Synthetic lesson", createdAt: "2026-11-11T10:00:00Z" }], total: 26 });
    render(<StudentWhiteboardHistory />);
    fireEvent.click(screen.getByText(title));
    expect(await screen.findByRole("navigation", { name: navigationLabel })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: nextLabel })).toBeInTheDocument();
  });

  it("loads one page at a time and returns to the previous page", async () => {
    api.list.mockImplementation(async (offset: number) => ({
      items: [{ id: `board-${offset}`, lessonId: "lesson-a", title: `Board ${offset}`, createdAt: "2026-11-11T10:00:00Z" }],
      total: 26,
    }));
    render(<StudentWhiteboardHistory />);
    fireEvent.click(screen.getByText("Saved whiteboards"));
    expect(await screen.findByRole("button", { name: /Board 0/ })).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith(0, 25);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("button", { name: /Board 25/ })).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith(25, 25);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByRole("button", { name: /Board 0/ })).toBeInTheDocument();
  });

  it("reports a failed list and retries without inventing an empty result", async () => {
    api.list.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ items: [], total: 0 });
    render(<StudentWhiteboardHistory />);
    fireEvent.click(screen.getByText("Saved whiteboards"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load saved whiteboards.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No saved whiteboards yet.")).toBeInTheDocument();
  });
});
