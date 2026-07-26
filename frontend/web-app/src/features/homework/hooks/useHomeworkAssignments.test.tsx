// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HomeworkAssignment,
  HomeworkSubmission,
  MeProfile,
  StudentHomeworkDetail,
} from "../../../shared/api/playsay";
import { useHomeworkAssignments } from "./useHomeworkAssignments";

const apiMocks = vi.hoisted(() => ({
  fetchMyHomeworkAssignment: vi.fn(),
  fetchMyHomeworkAssignments: vi.fn(),
  saveMyHomeworkAssignmentSubmission: vi.fn(),
}));

vi.mock("../../../shared/api/playsay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/api/playsay")>()),
  fetchMyHomeworkAssignment: apiMocks.fetchMyHomeworkAssignment,
  fetchMyHomeworkAssignments: apiMocks.fetchMyHomeworkAssignments,
  saveMyHomeworkAssignmentSubmission: apiMocks.saveMyHomeworkAssignmentSubmission,
}));

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const profile = {
  subject: "student-1",
  username: "student.one",
  roles: ["STUDENT"],
} satisfies MeProfile;

const assignment = {
  id: "assignment-1",
  materialId: "material-1",
  materialTitle: "Animals",
  title: "Animal homework",
  type: "HOMEWORK",
  status: "ACTIVE",
  recipientCount: 1,
  submittedCount: 0,
  scoredCount: 0,
  createdAt: "2026-07-25T08:00:00.000Z",
  updatedAt: "2026-07-25T08:00:00.000Z",
  mySubmissionState: "NOT_STARTED",
} satisfies HomeworkAssignment;

const submission = {
  id: "submission-1",
  assignmentId: assignment.id,
  materialId: assignment.materialId,
  userId: "user-1",
  content: {
    schemaVersion: 1,
    materialId: assignment.materialId,
    answers: {},
  },
  score: null,
  errorsCount: null,
  submittedAt: null,
  createdAt: "2026-07-25T08:00:00.000Z",
  updatedAt: "2026-07-25T08:00:00.000Z",
} satisfies HomeworkSubmission;

const detail = {
  assignment,
  material: {
    id: assignment.materialId,
    title: assignment.materialTitle,
    description: null,
    language: "en",
    cefrLevel: "A2",
    visibility: "PRIVATE",
    status: "PUBLISHED",
    document: {
      schemaVersion: 1,
      pages: [{ id: "page-1", title: "Task", layout: "FLOW", blocks: [] }],
    },
    sourceMeta: {},
    scoringRubric: {},
    topicTags: [],
    skillTags: [],
    blockCount: 0,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  },
  submission,
} satisfies StudentHomeworkDetail;

describe("useHomeworkAssignments student flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchMyHomeworkAssignments.mockResolvedValue([assignment]);
    apiMocks.fetchMyHomeworkAssignment.mockResolvedValue(detail);
    apiMocks.saveMyHomeworkAssignmentSubmission.mockImplementation(async (_assignmentId, input) => ({
      ...submission,
      content: input.content,
      updatedAt: "2026-07-25T08:01:00.000Z",
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the list closed initially and autosaves an unsubmitted draft after one second", async () => {
    const { result } = renderHook(() => useHomeworkAssignments({ canManage: false, profile }));

    await waitFor(() => expect(result.current.assignments).toHaveLength(1));
    expect(result.current.selectedAssignmentId).toBeNull();

    act(() => result.current.setSelectedAssignmentId(assignment.id));
    await waitFor(() => expect(result.current.studentDetail?.assignment.id).toBe(assignment.id));

    vi.useFakeTimers();
    act(() => result.current.updateAnswer("writing-1", { type: "freeWriting", text: "Hello" }));
    expect(apiMocks.saveMyHomeworkAssignmentSubmission).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(apiMocks.saveMyHomeworkAssignmentSubmission).toHaveBeenCalledWith(
      assignment.id,
      expect.objectContaining({ submitted: false }),
    );
    expect(result.current.draftSaveState).toBe("saved");
  });

  it("does not silently overwrite an already submitted result after editing", async () => {
    apiMocks.fetchMyHomeworkAssignment.mockResolvedValue({
      ...detail,
      submission: { ...submission, submittedAt: "2026-07-25T08:00:30.000Z" },
    });
    const { result } = renderHook(() => useHomeworkAssignments({ canManage: false, profile }));

    await waitFor(() => expect(result.current.assignments).toHaveLength(1));
    act(() => result.current.setSelectedAssignmentId(assignment.id));
    await waitFor(() => expect(result.current.studentDetail?.submission.submittedAt).toBeTruthy());

    vi.useFakeTimers();
    act(() => result.current.updateAnswer("writing-1", { type: "freeWriting", text: "Changed" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.studentHasUnsavedChanges).toBe(true);
    expect(apiMocks.saveMyHomeworkAssignmentSubmission).not.toHaveBeenCalled();
  });
});
