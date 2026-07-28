// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VocabularyLessonMenu } from "./VocabularyLessonMenu";

const fetchVocabularyOverview = vi.fn();

vi.mock("../../../shared/api/playsay", () => ({
  fetchVocabularyOverview: (...args: unknown[]) => fetchVocabularyOverview(...args),
  openVocabularySocket: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("./VocabularyEntryDialog", () => ({
  VocabularyEntryDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">entry-dialog</div> : null,
}));

describe("VocabularyLessonMenu", () => {
  afterEach(cleanup);

  beforeEach(() => {
    fetchVocabularyOverview.mockReset();
    fetchVocabularyOverview.mockResolvedValue({
      lessonEntries: [],
      recentEntries: [],
    });
  });

  it("opens a compact menu with add and recent actions", () => {
    const view = render(
      <VocabularyLessonMenu
        source={{ lessonId: "lesson-1", sourceType: "LESSON" }}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "vocabulary.lessonMenu.open" }));

    expect(view.getByRole("menuitem", { name: "vocabulary.lessonMenu.add" })).toBeTruthy();
    expect(view.getByRole("menuitem", { name: "vocabulary.lessonMenu.recent" })).toBeTruthy();
  });

  it("moves focus between actions with arrow keys", async () => {
    const view = render(
      <VocabularyLessonMenu
        source={{ lessonId: "lesson-1", sourceType: "LESSON" }}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "vocabulary.lessonMenu.open" }));
    const addAction = view.getByRole("menuitem", { name: "vocabulary.lessonMenu.add" });
    const recentAction = view.getByRole("menuitem", { name: "vocabulary.lessonMenu.recent" });

    await waitFor(() => expect(document.activeElement).toBe(addAction));
    fireEvent.keyDown(addAction, { key: "ArrowDown" });
    expect(document.activeElement).toBe(recentAction);
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
      <VocabularyLessonMenu
        ownerSubject="student-1"
        ownerLabel="Мила"
        source={{ lessonId: "lesson-1", sourceType: "LESSON" }}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "vocabulary.lessonMenu.open" }));
    fireEvent.click(view.getByRole("menuitem", { name: "vocabulary.lessonMenu.recent" }));

    await waitFor(() => expect(fetchVocabularyOverview).toHaveBeenCalledWith("student-1", "lesson-1", 5));
    expect(view.getAllByRole("listitem")).toHaveLength(5);
    expect(view.getByText("Мила")).toBeTruthy();
  });
});
