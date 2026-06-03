import { describe, expect, it } from "vitest";
import type { LessonMaterialSubmission } from "../../../shared/api/playsay";
import {
  acknowledgeStudentHealth,
  studentHealthForSubject,
  updateStudentHealthState,
  type StudentHealthState,
} from "./studentHealth";

function submission(subject: string, errorsCount: number, updatedAt: string): LessonMaterialSubmission {
  return {
    id: `${subject}-${errorsCount}-${updatedAt}`,
    assignmentId: "assignment-1",
    lessonId: "lesson-1",
    materialId: "material-1",
    userId: `${subject}-user`,
    userSubject: subject,
    userName: subject,
    content: {},
    errorsCount,
    score: 10 - errorsCount,
    submittedAt: updatedAt,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("studentHealth", () => {
  it("keeps the first new error at watch instead of hot", () => {
    const state = updateStudentHealthState({}, [submission("student-1", 1, "2026-06-03T10:00:00.000Z")], ["student-1"]);

    expect(studentHealthForSubject(state, "student-1")?.tone).toBe("watch");
    expect(studentHealthForSubject(state, "student-1")?.newErrors).toBe(1);
  });

  it("escalates consecutive error increases to hot", () => {
    const first = updateStudentHealthState({}, [submission("student-1", 1, "2026-06-03T10:00:00.000Z")], ["student-1"]);
    const second = updateStudentHealthState(first, [submission("student-1", 2, "2026-06-03T10:00:05.000Z")], ["student-1"]);

    expect(studentHealthForSubject(second, "student-1")?.tone).toBe("hot");
    expect(studentHealthForSubject(second, "student-1")?.consecutiveErrorIncreases).toBe(2);
  });

  it("acknowledges active student and only counts later errors", () => {
    const beforeClick = updateStudentHealthState({}, [submission("student-1", 2, "2026-06-03T10:00:00.000Z")], ["student-1"]);
    const acknowledged = acknowledgeStudentHealth(beforeClick, "student-1");
    const afterClick = updateStudentHealthState(
      acknowledged,
      [submission("student-1", 2, "2026-06-03T10:00:05.000Z")],
      ["student-1"],
    );
    const afterNewError = updateStudentHealthState(
      afterClick,
      [submission("student-1", 3, "2026-06-03T10:00:10.000Z")],
      ["student-1"],
    );

    expect(studentHealthForSubject(afterClick, "student-1")?.tone).toBe("clear");
    expect(studentHealthForSubject(afterNewError, "student-1")?.tone).toBe("watch");
    expect(studentHealthForSubject(afterNewError, "student-1")?.newErrors).toBe(1);
  });

  it("removes students that are no longer part of the monitored group", () => {
    const previous: StudentHealthState = updateStudentHealthState(
      {},
      [
        submission("student-1", 1, "2026-06-03T10:00:00.000Z"),
        submission("student-2", 1, "2026-06-03T10:00:00.000Z"),
      ],
      ["student-1", "student-2"],
    );

    const next = updateStudentHealthState(previous, [submission("student-1", 1, "2026-06-03T10:00:05.000Z")], ["student-1"]);

    expect(Object.keys(next)).toEqual(["student-1"]);
  });
});
