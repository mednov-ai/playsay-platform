// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VocabularyPracticeSession } from "../../../shared/api/playsay";
import { VocabularyPracticePlayer } from "./VocabularyPracticePlayer";

const revealVocabularyPracticeItem = vi.fn();

vi.mock("../../../shared/api/playsay", () => ({
  fetchVocabularyPracticeSession: vi.fn(),
  recordVocabularyAttempt: vi.fn(),
  revealVocabularyPracticeItem: (...args: unknown[]) => revealVocabularyPracticeItem(...args),
}));

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

beforeEach(() => {
  revealVocabularyPracticeItem.mockReset();
  revealVocabularyPracticeItem.mockResolvedValue({ itemId: "item-1", expectedAnswer: "устойчивый" });
});

describe("VocabularyPracticePlayer", () => {
  it("reveals a flashcard answer only through the authorized reveal request", async () => {
    render(<VocabularyPracticePlayer initialSession={session({
      exerciseType: "FLASHCARD",
      prompt: "steady",
      content: { type: "FLASHCARD" },
    })} />);

    expect(screen.queryByText("устойчивый")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "vocabulary.practice.actions.reveal" }));

    await waitFor(() => expect(revealVocabularyPracticeItem).toHaveBeenCalledWith("session-1", "item-1"));
    expect(screen.getByText("устойчивый")).toBeInTheDocument();
  });

  it("builds and removes matching pairs with ordinary accessible buttons", () => {
    render(<VocabularyPracticePlayer initialSession={session({
      entryId: null,
      exerciseType: "MATCHING",
      prompt: "",
      content: {
        type: "MATCHING",
        left: [{ id: "l0", label: "cat" }, { id: "l1", label: "dog" }],
        right: [{ id: "r1", label: "собака" }, { id: "r0", label: "кот" }],
      },
    })} />);

    fireEvent.click(screen.getByRole("button", { name: "cat" }));
    fireEvent.click(screen.getByRole("button", { name: "кот" }));
    fireEvent.click(screen.getByRole("button", { name: "vocabulary.practice.matching.connect" }));

    expect(screen.getByText("cat ↔ кот")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "cat" })).toBeDisabled();
    fireEvent.click(screen.getByText("cat ↔ кот").closest("button")!);
    expect(screen.queryByText("cat ↔ кот")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "cat" })).toBeEnabled();
  });

  it("uses phrase chips once and lets the learner remove one chip", () => {
    render(<VocabularyPracticePlayer initialSession={session({
      exerciseType: "PHRASE_BUILDER",
      prompt: "береги себя",
      content: {
        type: "PHRASE_BUILDER",
        tokens: [{ id: "p1", label: "care" }, { id: "p0", label: "take" }],
      },
    })} />);

    const take = screen.getByRole("button", { name: "take" });
    fireEvent.click(take);
    expect(take).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "vocabulary.practice.phrase.remove" }));
    expect(take).toBeEnabled();
  });
});

function session(item: Partial<NonNullable<VocabularyPracticeSession["currentItem"]>>): VocabularyPracticeSession {
  return {
    attemptCount: 0,
    completedItems: 0,
    correctCount: 0,
    currentItem: {
      affectsSchedule: false,
      content: { type: "FLASHCARD" },
      entryId: "entry-1",
      exerciseType: "FLASHCARD",
      id: "item-1",
      options: [],
      position: 0,
      prompt: "steady",
      schemaVersion: 2,
      skill: "MEANING",
      ...item,
    },
    helpRequested: false,
    id: "session-1",
    ownerSubject: "student-1",
    revision: 0,
    status: "NOT_STARTED",
    totalItems: 1,
    updatedAt: "2026-07-29T10:00:00Z",
  };
}
