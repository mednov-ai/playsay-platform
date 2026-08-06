// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VocabularyLessonDialog } from "./VocabularyLessonDialog";

const fetchVocabularyOverview = vi.fn();

vi.mock("../../../shared/api/playsay", () => ({
  fetchVocabularyOverview: (...args: unknown[]) => fetchVocabularyOverview(...args),
  openVocabularySocket: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

describe("VocabularyLessonDialog", () => {
  afterEach(() => {
    cleanup();
    document.getElementById("root")?.remove();
    document.body.style.overflow = "";
  });

  beforeEach(() => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
    fetchVocabularyOverview.mockReset();
    fetchVocabularyOverview.mockResolvedValue({
      lessonEntries: [],
      recentEntries: [],
    });
  });

  it("opens a portalled modal with two tabs and locks the app root", async () => {
    const view = render(
      <VocabularyLessonDialog
        source={{ lessonId: "lesson-1", sourceType: "LESSON" }}
      />,
    );

    const trigger = view.getByRole("button", { name: "vocabulary.lessonMenu.open" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(trigger);

    const dialog = view.getByRole("dialog", { name: "vocabulary.lessonMenu.dialogTitle" });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(view.queryByRole("menu")).toBeNull();
    expect(view.getByRole("tab", { name: "vocabulary.lessonMenu.add" }).getAttribute("aria-selected")).toBe("true");
    expect(view.getByRole("tab", { name: "vocabulary.lessonMenu.recent" })).toBeTruthy();
    expect(document.getElementById("root")?.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    await waitFor(() => expect(document.activeElement).toBe(view.getByLabelText("vocabulary.fields.word")));
  });

  it("closes with Escape and restores focus to the trigger", async () => {
    const view = render(
      <VocabularyLessonDialog
        source={{ lessonId: "lesson-1", sourceType: "LESSON" }}
      />,
    );

    const trigger = view.getByRole("button", { name: "vocabulary.lessonMenu.open" });
    fireEvent.click(trigger);
    const input = view.getByLabelText("vocabulary.fields.word");
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.getElementById("root")?.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("moves between tabs with the keyboard", async () => {
    const view = render(
      <VocabularyLessonDialog source={{ lessonId: "lesson-1", sourceType: "LESSON" }} />,
    );

    fireEvent.click(view.getByRole("button", { name: "vocabulary.lessonMenu.open" }));
    const addTab = view.getByRole("tab", { name: "vocabulary.lessonMenu.add" });
    const recentTab = view.getByRole("tab", { name: "vocabulary.lessonMenu.recent" });
    addTab.focus();
    fireEvent.keyDown(addTab, { key: "ArrowRight" });

    await waitFor(() => expect(document.activeElement).toBe(recentTab));
    expect(recentTab.getAttribute("aria-selected")).toBe("true");
    expect(addTab.getAttribute("tabindex")).toBe("-1");
  });

  it("shows no more than five synchronized recent words", async () => {
    fetchVocabularyOverview.mockResolvedValue({
      lessonEntries: [
        { id: "1", sourceText: "arrive", translation: "прибывать" },
        { id: "2", sourceText: "journey", translation: "путешествие" },
      ],
      recentEntries: [
        { id: "3", sourceText: "ticket", translation: "билет" },
        { id: "4", sourceText: "platform", translation: "платформа" },
        { id: "5", sourceText: "luggage", translation: "багаж" },
        { id: "6", sourceText: "delay", translation: "задержка" },
      ],
    });
    const view = render(
      <VocabularyLessonDialog
        ownerSubject="student-1"
        ownerLabel="Мила"
        source={{ lessonId: "lesson-1", sourceType: "LESSON" }}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "vocabulary.lessonMenu.open" }));
    fireEvent.click(view.getByRole("tab", { name: "vocabulary.lessonMenu.recent" }));

    await waitFor(() => expect(fetchVocabularyOverview).toHaveBeenCalledWith("student-1", "lesson-1", 5));
    expect(view.getAllByRole("listitem")).toHaveLength(5);
    expect(view.getByText("Мила")).toBeTruthy();
  });

  it("keeps the teacher target fixed while the dialog is open", async () => {
    const view = render(
      <VocabularyLessonDialog
        ownerLabel="Мила"
        ownerSubject="student-1"
        source={{ lessonId: "lesson-1", ownerSubject: "student-1", sourceType: "LESSON" }}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "vocabulary.lessonMenu.open" }));
    view.rerender(
      <VocabularyLessonDialog
        ownerLabel="Антон"
        ownerSubject="student-2"
        source={{ lessonId: "lesson-1", ownerSubject: "student-2", sourceType: "LESSON" }}
      />,
    );
    fireEvent.click(view.getByRole("tab", { name: "vocabulary.lessonMenu.recent" }));

    await waitFor(() => expect(fetchVocabularyOverview).toHaveBeenCalledWith("student-1", "lesson-1", 5));
    expect(view.getByText("Мила")).toBeTruthy();
    expect(view.queryByText("Антон")).toBeNull();
  });

  it("closes only when the backdrop itself is pressed", () => {
    const view = render(
      <VocabularyLessonDialog source={{ lessonId: "lesson-1", sourceType: "LESSON" }} />,
    );

    fireEvent.click(view.getByRole("button", { name: "vocabulary.lessonMenu.open" }));
    const dialog = view.getByRole("dialog");
    fireEvent.mouseDown(dialog);
    expect(view.getByRole("dialog")).toBeTruthy();
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(view.queryByRole("dialog")).toBeNull();
  });
});
