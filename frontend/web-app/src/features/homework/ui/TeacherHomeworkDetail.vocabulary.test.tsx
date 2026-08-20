// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeworkAssignmentDetail } from "../../../shared/api/types";
import { TeacherHomeworkDetail } from "./TeacherHomeworkDetail";

const reviewVocabularyHomeworkAssignment = vi.fn();

vi.mock("../../../shared/api/playsay", () => ({
  fetchHomeworkSubmissionResult: vi.fn(),
  fetchVocabularyPracticeSession: vi.fn(),
  reviewVocabularyHomeworkAssignment: (...args: unknown[]) => reviewVocabularyHomeworkAssignment(...args),
}));
vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }),
}));
vi.mock("../../vocabulary/ui/VocabularyPracticePlayer", () => ({ VocabularyPracticePlayer: () => null }));
vi.mock("../../classroom", () => ({ ControlledAnnotationCanvas: () => null }));

afterEach(() => {
  cleanup();
  reviewVocabularyHomeworkAssignment.mockReset();
});

describe("TeacherHomeworkDetail vocabulary report", () => {
  it("keeps diagnostics separate and accepts work awaiting teacher review", async () => {
    const detail = vocabularyDetail();
    reviewVocabularyHomeworkAssignment.mockResolvedValue({
      ...detail,
      recipients: [{ ...detail.recipients[0], activityState: "COMPLETED", reviewState: "ACCEPTED" }],
    });
    const onDetailChange = vi.fn();

    render(<TeacherHomeworkDetail assignment={detail.assignment} detail={detail} lastLoadedAt={null} onDetailChange={onDetailChange} />);

    expect(screen.getByText("homework.report.activityValue:{\"entries\":4,\"prompts\":8}")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();
    expect(screen.getByText("homework.report.minutes:{\"count\":5}")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("homework.review.note"), { target: { value: "Good effort" } });
    fireEvent.click(screen.getByRole("button", { name: "homework.review.accept" }));

    await waitFor(() => expect(reviewVocabularyHomeworkAssignment).toHaveBeenCalledWith(
      "assignment-1",
      "student-1",
      "ACCEPT",
      "Good effort",
    ));
    expect(onDetailChange).toHaveBeenCalled();
  });
});

function vocabularyDetail(): HomeworkAssignmentDetail {
  return {
    assignment: {
      contentKind: "VOCABULARY_PRACTICE",
      createdAt: "2026-08-20T10:00:00Z",
      id: "assignment-1",
      recipientCount: 1,
      scoredCount: 0,
      status: "ACTIVE",
      submittedCount: 0,
      title: "Vocabulary review",
      type: "HOMEWORK",
      updatedAt: "2026-08-20T10:05:00Z",
    },
    recipients: [{
      accuracy: 0.62,
      activityRef: "session-1",
      activityState: "AWAITING_REVIEW",
      activeDurationMs: 300_000,
      assignmentId: "assignment-1",
      completionRatio: 1,
      difficultWordCount: 2,
      distinctEntries: 4,
      distinctGradedPrompts: 8,
      hasSubmission: false,
      hintsUsed: 1,
      masteryRatio: 0.7,
      showGroupIndicator: false,
      studentSubject: "student-1",
      studentUserId: "student-user-1",
      submitted: false,
    }],
  };
}
