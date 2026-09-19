// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VocabularyPracticeSession } from "../../../shared/api/playsay";
import { VocabularyPracticePlayer } from "./VocabularyPracticePlayer";

const revealVocabularyPracticeItem = vi.fn();
const recordVocabularyAttempt = vi.fn();
const fetchVocabularyPracticeSession = vi.fn();

vi.mock("../../../shared/api/playsay", () => ({
  isApiStatus: () => false,
  fetchVocabularyPracticeSession: (...args: unknown[]) => fetchVocabularyPracticeSession(...args),
  recordVocabularyAttempt: (...args: unknown[]) => recordVocabularyAttempt(...args),
  revealVocabularyPracticeItem: (...args: unknown[]) => revealVocabularyPracticeItem(...args),
}));

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);

beforeEach(() => {
  revealVocabularyPracticeItem.mockReset();
  revealVocabularyPracticeItem.mockResolvedValue({ itemId: "item-1", expectedAnswer: "устойчивый" });
  recordVocabularyAttempt.mockReset();
  fetchVocabularyPracticeSession.mockReset();
});

describe("VocabularyPracticePlayer", () => {
  it("retains corrective feedback through parent updates including the final answer", async () => {
    const initial = { ...session({ exerciseType: "FORM_INPUT", prompt: "Write steady" }), totalItems: 2 };
    function Parent() {
      const [value, setValue] = useState(initial);
      return <VocabularyPracticePlayer initialSession={value} onSessionChange={setValue} />;
    }
    recordVocabularyAttempt.mockResolvedValueOnce({ correct: false, expectedAnswer: "steady", session: {
      ...initial, revision: 1, completedItems: 1, currentItem: { ...initial.currentItem!, id: "item-2", prompt: "Next" },
    }}).mockResolvedValueOnce({ correct: true, expectedAnswer: "done", session: {
      ...initial, revision: 2, completedItems: 2, currentItem: null, status: "COMPLETED",
    }});
    render(<Parent />);
    fireEvent.change(screen.getByLabelText("vocabulary.practice.answerLabel"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByText("vocabulary.practice.actions.check"));
    await waitFor(() => expect(screen.getByText("steady")).toBeInTheDocument());
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("vocabulary.practice.actions.continue"));
    fireEvent.change(screen.getByLabelText("vocabulary.practice.answerLabel"), { target: { value: "done" } });
    fireEvent.click(screen.getByText("vocabulary.practice.actions.check"));
    await waitFor(() => expect(screen.getByText("vocabulary.practice.actions.continue")).toBeInTheDocument());
    expect(screen.queryByText("vocabulary.practice.complete.title")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("vocabulary.practice.actions.continue"));
    expect(screen.getByText("vocabulary.practice.complete.title")).toBeInTheDocument();
  });

  it("blocks repeated form submissions while pending", () => {
    recordVocabularyAttempt.mockImplementation(() => new Promise(() => {}));
    render(<VocabularyPracticePlayer initialSession={session({ exerciseType: "FORM_INPUT" })} />);
    const input = screen.getByLabelText("vocabulary.practice.answerLabel");
    fireEvent.change(input, { target: { value: "steady" } });
    fireEvent.submit(input.closest("form")!);
    fireEvent.submit(input.closest("form")!);
    expect(recordVocabularyAttempt).toHaveBeenCalledTimes(1);
  });

  it("keeps a draft on same-item hints and ignores old revisions", () => {
    const initial = session({ exerciseType: "FORM_INPUT" });
    const { rerender } = render(<VocabularyPracticePlayer initialSession={initial} />);
    fireEvent.change(screen.getByLabelText("vocabulary.practice.answerLabel"), { target: { value: "draft" } });
    rerender(<VocabularyPracticePlayer initialSession={{ ...initial, revision: 2, teacherHint: "hint" }} />);
    expect(screen.getByLabelText("vocabulary.practice.answerLabel")).toHaveValue("draft");
    rerender(<VocabularyPracticePlayer initialSession={{ ...initial, revision: 1 }} />);
    expect(screen.getByText("vocabulary.practice.teacherHint")).toBeInTheDocument();
  });

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

  it("reuses the attempt id after a reconnect so the backend can deduplicate", async () => {
    const initial = session({ exerciseType: "FORM_INPUT", prompt: "Write steady", skill: "FORM" });
    recordVocabularyAttempt.mockRejectedValueOnce(new Error("offline"));
    fetchVocabularyPracticeSession.mockResolvedValue(initial);
    render(<VocabularyPracticePlayer initialSession={initial} />);

    fireEvent.change(screen.getByLabelText("vocabulary.practice.answerLabel"), { target: { value: "steady" } });
    fireEvent.click(screen.getByRole("button", { name: "vocabulary.practice.actions.check" }));
    await waitFor(() => expect(fetchVocabularyPracticeSession).toHaveBeenCalledWith("session-1"));
    fireEvent.click(screen.getByRole("button", { name: "vocabulary.practice.actions.retry" }));
    await waitFor(() => expect(recordVocabularyAttempt).toHaveBeenCalledTimes(2));

    expect(recordVocabularyAttempt.mock.calls[0][1].clientAttemptId)
      .toBe(recordVocabularyAttempt.mock.calls[1][1].clientAttemptId);
  });

  it("prevents a duplicate submit while the first answer is pending and announces progress", async () => {
    let resolveAttempt: ((value: unknown) => void) | undefined;
    recordVocabularyAttempt.mockImplementation(() => new Promise((resolve) => { resolveAttempt = resolve; }));
    render(<VocabularyPracticePlayer initialSession={session({ exerciseType: "FORM_INPUT", prompt: "Write steady", skill: "FORM" })} />);

    expect(screen.getByText("vocabulary.practice.progress").parentElement).toHaveAttribute("aria-live", "polite");
    fireEvent.change(screen.getByLabelText("vocabulary.practice.answerLabel"), { target: { value: "steady" } });
    const submit = screen.getByRole("button", { name: "vocabulary.practice.actions.check" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(recordVocabularyAttempt).toHaveBeenCalledTimes(1);
    resolveAttempt?.({
      attemptId: "attempt-1",
      correct: true,
      expectedAnswer: "steady",
      rating: "GOOD",
      session: { ...session({}), attemptCount: 1, completedItems: 1, correctCount: 1, currentItem: null, status: "COMPLETED" },
    });
    await waitFor(() => expect(screen.getByText("vocabulary.practice.actions.continue")).toBeInTheDocument());
    fireEvent.click(screen.getByText("vocabulary.practice.actions.continue"));
    expect(screen.getByText("vocabulary.practice.complete.title")).toBeInTheDocument();
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
