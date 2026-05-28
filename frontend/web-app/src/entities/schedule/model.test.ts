import { describe, expect, it } from "vitest";
import {
  compareScheduleLessons,
  formatDuration,
  formatLessonType,
  formatParticipantCount,
  isJoinableScheduledLesson,
  scheduleStateLabel,
  selectedParticipantSubjects,
} from "./model";
import type { ScheduledLesson } from "../../shared/api/playsay";

function lesson(patch: Partial<ScheduledLesson>): ScheduledLesson {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: patch.id ?? "lesson-1",
    participants: [],
    scheduledEnd: null,
    scheduledStart: null,
    status: "SCHEDULED",
    type: "GROUP",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("schedule model", () => {
  it("labels schedule states without changing backend status values", () => {
    const nowMs = Date.parse("2026-05-28T10:00:00.000Z");

    expect(scheduleStateLabel(lesson({ status: "CANCELLED" }), nowMs)).toBe("Отменён");
    expect(scheduleStateLabel(lesson({ scheduledEnd: "2026-05-28T09:00:00.000Z" }), nowMs)).toBe("Истёк");
    expect(scheduleStateLabel(lesson({ scheduledStart: "2026-05-28T09:30:00.000Z", scheduledEnd: "2026-05-28T10:30:00.000Z" }), nowMs)).toBe("В эфире");
    expect(scheduleStateLabel(lesson({ scheduledStart: "2026-05-28T11:00:00.000Z" }), nowMs)).toBe("Запланирован");
  });

  it("sorts current and upcoming lessons before archived lessons", () => {
    const nowMs = Date.parse("2026-05-28T10:00:00.000Z");
    const sorted = [
      lesson({ id: "old", scheduledEnd: "2026-05-28T09:00:00.000Z" }),
      lesson({ id: "future", scheduledStart: "2026-05-28T12:00:00.000Z" }),
      lesson({ id: "live", scheduledStart: "2026-05-28T09:55:00.000Z", scheduledEnd: "2026-05-28T10:45:00.000Z" }),
    ].sort((left, right) => compareScheduleLessons(left, right, nowMs));

    expect(sorted.map((item) => item.id)).toEqual(["live", "future", "old"]);
    expect(isJoinableScheduledLesson(sorted[0], nowMs)).toBe(true);
  });

  it("formats compact schedule values for UI", () => {
    expect(formatDuration(45)).toBe("45 мин");
    expect(formatDuration(null)).toBe("длительность позже");
    expect(formatLessonType("INDIVIDUAL")).toBe("Индивидуально");
    expect(formatLessonType("GROUP")).toBe("Группа");
    expect(formatParticipantCount(0)).toBe("ученики позже");
    expect(formatParticipantCount(1)).toBe("1 ученик");
    expect(formatParticipantCount(3)).toBe("3 ученика");
    expect(formatParticipantCount(8)).toBe("8 учеников");
    expect(selectedParticipantSubjects(" one, two ,, three ")).toEqual(["one", "two", "three"]);
  });
});
