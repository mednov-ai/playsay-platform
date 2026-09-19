// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VocabularyPractice } from "../../../shared/api/vocabulary";
import { LessonActivityRail } from "./LessonActivityRail";

const createVocabularyHomeworkAssignment = vi.fn();
const updateVocabularyPracticeStatus = vi.fn();
const giveVocabularyPracticeHint = vi.fn();

vi.mock("../../../shared/api/playsay", () => ({
  createVocabularyHomeworkAssignment: (...args: unknown[]) => createVocabularyHomeworkAssignment(...args),
  createVocabularyPractice: vi.fn(),
  giveVocabularyPracticeHint: (...args: unknown[]) => giveVocabularyPracticeHint(...args),
  updateVocabularyPracticeStatus: (...args: unknown[]) => updateVocabularyPracticeStatus(...args),
}));
vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }),
}));
vi.mock("../../vocabulary/ui/PersonalPracticeComposer", () => ({ PersonalPracticeComposer: () => null }));
vi.mock("./TeacherLessonToolbar", () => ({ TeacherAddMaterialMenu: () => null }));

afterEach(() => {
  cleanup();
  createVocabularyHomeworkAssignment.mockReset();
  updateVocabularyPracticeStatus.mockReset();
  giveVocabularyPracticeHint.mockReset();
});

describe("LessonActivityRail vocabulary delivery", () => {
  it.each(["hint", "pause"])("keeps failed %s commands recoverable without leaking technical errors", async (command) => {
    const practice = livePractice();
    const changed = vi.fn();
    const api = command === "hint" ? giveVocabularyPracticeHint : updateVocabularyPracticeStatus;
    api.mockRejectedValueOnce(new Error("private transport details"));
    api.mockResolvedValueOnce(command === "hint" ? { ...practice.sessions[0], revision: 3 } : { ...practice, status: "PAUSED" });
    render(<LessonActivityRail
      assigningMaterial={false} currentMaterialId={null} lessonId="lesson-1" materials={[]}
      onAssignMaterial={vi.fn()} onClose={vi.fn()} onPracticeChange={changed}
      onSelectMaterial={vi.fn()} onSelectStudent={vi.fn()} onUploadHtmlGamePage={vi.fn()}
      onUploadImagePage={vi.fn()} open owners={[]} practice={practice} selectedMaterialId=""
      selectedStudentSubject="student-1" uploadingHtmlGamePage={false} uploadingImagePage={false}
    />);
    const button = screen.getByRole("button", { name: command === "hint" ? /vocabulary.live.giveHint/ : /vocabulary.live.pause/ });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("vocabulary.practice.errors.save");
    expect(document.body).not.toHaveTextContent("private transport details");
    expect(changed).not.toHaveBeenCalled();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows private live diagnostics and explicitly continues unfinished snapshots at home", async () => {
    const practice = livePractice();
    updateVocabularyPracticeStatus.mockResolvedValue({ ...practice, status: "COMPLETED" });
    createVocabularyHomeworkAssignment.mockResolvedValue({});

    render(
      <LessonActivityRail
        assigningMaterial={false}
        currentMaterialId={null}
        lessonId="lesson-1"
        materials={[]}
        onAssignMaterial={vi.fn()}
        onClose={vi.fn()}
        onPracticeChange={vi.fn()}
        onSelectMaterial={vi.fn()}
        onSelectStudent={vi.fn()}
        onUploadHtmlGamePage={vi.fn()}
        onUploadImagePage={vi.fn()}
        open
        owners={[]}
        practice={practice}
        selectedMaterialId=""
        selectedStudentSubject="student-1"
        uploadingHtmlGamePage={false}
        uploadingImagePage={false}
      />,
    );

    expect(screen.getByText(/vocabulary\.live\.activity/)).toBeInTheDocument();
    expect(screen.getByText("vocabulary.live.helpRequested")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /vocabulary\.live\.stop$/ }));
    expect(screen.getByText("vocabulary.live.closeDescription")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /vocabulary\.live\.stopAndContinueHome/ }));

    await waitFor(() => expect(updateVocabularyPracticeStatus).toHaveBeenCalledWith("practice-1", "COMPLETED"));
    expect(createVocabularyHomeworkAssignment).toHaveBeenCalledWith(expect.objectContaining({
      completionPolicy: "MEANINGFUL_ACTIVITY",
      sourcePracticeId: "practice-1",
      studentSubjects: ["student-1"],
    }));
  });
});

function livePractice(): VocabularyPractice {
  return {
    createdAt: "2026-08-20T18:00:00Z",
    delivery: "LIVE",
    id: "practice-1",
    lessonId: "lesson-1",
    mode: "BALANCED",
    sessions: [{
      attemptCount: 3,
      completedItems: 2,
      correctCount: 1,
      helpRequested: true,
      id: "session-1",
      ownerName: "Learner",
      ownerSubject: "student-1",
      revision: 2,
      status: "IN_PROGRESS",
      teacherHint: "Try the example",
      totalItems: 5,
      updatedAt: new Date().toISOString(),
    }],
    status: "ACTIVE",
    updatedAt: "2026-08-20T18:00:00Z",
  };
}
