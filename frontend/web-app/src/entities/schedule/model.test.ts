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

function t(key: string, options?: Record<string, unknown>): string {
  return typeof options?.count === "number" ? `${key}:${options.count}` : key;
}

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
    workMode: "SHARED",
    ...patch,
  };
}

describe("schedule model", () => {
  it("labels schedule states without changing backend status values", () => {
    const nowMs = Date.parse("2026-05-28T10:00:00.000Z");

    expect(scheduleStateLabel(lesson({ status: "CANCELLED" }), nowMs, t)).toBe("schedule.state.cancelled");
    expect(scheduleStateLabel(lesson({ scheduledEnd: "2026-05-28T09:00:00.000Z" }), nowMs, t)).toBe("schedule.state.expired");
    expect(scheduleStateLabel(lesson({ scheduledStart: "2026-05-28T09:30:00.000Z", scheduledEnd: "2026-05-28T10:30:00.000Z" }), nowMs, t)).toBe("schedule.state.live");
    expect(scheduleStateLabel(lesson({ scheduledStart: "2026-05-28T11:00:00.000Z" }), nowMs, t)).toBe("schedule.state.planned");
    expect(scheduleStateLabel(lesson({ scheduledStart: "2026-05-28T10:08:00.000Z", scheduledEnd: "2026-05-28T10:53:00.000Z" }), nowMs, t)).toBe("schedule.state.opensSoon");
    expect(scheduleStateLabel(lesson({ scheduledStart: "2026-05-28T09:07:00.000Z", scheduledEnd: "2026-05-28T09:52:00.000Z" }), nowMs, t)).toBe("schedule.state.closingSoon");
  });

  it("opens live lesson access only from ten minutes before start until ten minutes after end", () => {
    const nowMs = Date.parse("2026-05-28T10:00:00.000Z");

    expect(isJoinableScheduledLesson(lesson({
      scheduledStart: "2026-05-28T10:11:00.000Z",
      scheduledEnd: "2026-05-28T10:56:00.000Z",
    }), nowMs)).toBe(false);
    expect(isJoinableScheduledLesson(lesson({
      scheduledStart: "2026-05-28T10:10:00.000Z",
      scheduledEnd: "2026-05-28T10:55:00.000Z",
    }), nowMs)).toBe(true);
    expect(isJoinableScheduledLesson(lesson({
      scheduledStart: "2026-05-28T09:05:00.000Z",
      scheduledEnd: "2026-05-28T09:50:00.000Z",
    }), nowMs)).toBe(true);
    expect(isJoinableScheduledLesson(lesson({
      scheduledStart: "2026-05-28T09:04:00.000Z",
      scheduledEnd: "2026-05-28T09:49:00.000Z",
    }), nowMs)).toBe(false);
    expect(isJoinableScheduledLesson(lesson({
      scheduledStart: null,
      scheduledEnd: "2026-05-28T10:45:00.000Z",
    }), nowMs)).toBe(false);
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
    expect(formatDuration(45, t)).toBe("schedule.duration.minutes:45");
    expect(formatDuration(null, t)).toBe("schedule.duration.pending");
    expect(formatLessonType("INDIVIDUAL", t)).toBe("schedule.lessonType.individual");
    expect(formatLessonType("GROUP", t)).toBe("schedule.lessonType.group");
    expect(formatParticipantCount(0, t)).toBe("schedule.participants.none");
    expect(formatParticipantCount(1, t)).toBe("schedule.participants.count:1");
    expect(formatParticipantCount(3, t)).toBe("schedule.participants.count:3");
    expect(formatParticipantCount(8, t)).toBe("schedule.participants.count:8");
    expect(selectedParticipantSubjects(" one, two ,, three ")).toEqual(["one", "two", "three"]);
  });
});
