import { describe, expect, it } from "vitest";
import type { HomeworkAssignment } from "../../../shared/api/playsay";
import { studentHomeworkStatus } from "./homeworkUtils";

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
} satisfies HomeworkAssignment;

describe("studentHomeworkStatus", () => {
  it("derives not-started, draft and submitted states from the personal summary", () => {
    expect(studentHomeworkStatus({ ...assignment, mySubmissionState: "NOT_STARTED" }, 1)).toBe("NOT_STARTED");
    expect(studentHomeworkStatus({ ...assignment, mySubmissionState: "DRAFT" }, 1)).toBe("DRAFT");
    expect(studentHomeworkStatus({ ...assignment, mySubmissionState: "SUBMITTED" }, 1)).toBe("SUBMITTED");
  });

  it("marks an unfinished assignment overdue without hiding a submitted result", () => {
    const dueAt = "2026-07-25T09:00:00.000Z";
    const afterDueAt = Date.parse("2026-07-25T10:00:00.000Z");

    expect(studentHomeworkStatus({ ...assignment, dueAt, mySubmissionState: "DRAFT" }, afterDueAt)).toBe("OVERDUE");
    expect(studentHomeworkStatus({ ...assignment, dueAt, mySubmissionState: "SUBMITTED" }, afterDueAt)).toBe("SUBMITTED");
  });
});
