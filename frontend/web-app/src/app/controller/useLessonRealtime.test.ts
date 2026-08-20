import { describe, expect, it } from "vitest";
import type { ScheduledLesson } from "../../shared/api/playsay";
import {
  lessonDiceRejection,
  lessonDiceRoll,
  lessonPresenceMap,
  realtimeClassroomClosureMessageKey,
} from "./useLessonRealtime";

describe("lesson realtime classroom closure", () => {
  it("uses the reschedule explanation when an in-progress room returns to scheduled", () => {
    expect(realtimeClassroomClosureMessageKey(lesson("SCHEDULED"), "IN_PROGRESS"))
      .toBe("schedule.messages.rescheduledClassroomClosed");
    expect(realtimeClassroomClosureMessageKey(lesson("COMPLETED"), "IN_PROGRESS"))
      .toBe("schedule.messages.finishedOrCancelled");
  });
});

describe("lessonPresenceMap", () => {
  it("keeps only known participant presence states", () => {
    expect(lessonPresenceMap([
      { subject: "student-offline", state: "OFFLINE" },
      { subject: "student-online", state: "ONLINE" },
      { subject: "student-checking", state: "CHECKING_DEVICES" },
      { subject: "student-invalid", state: "IN_ROOM" },
      { state: "ONLINE" },
    ])).toEqual({
      "student-checking": "CHECKING_DEVICES",
      "student-offline": "OFFLINE",
      "student-online": "ONLINE",
    });
  });
});

describe("lesson dice realtime payloads", () => {
  it("accepts complete D6 rolls and rejects malformed values", () => {
    expect(lessonDiceRoll({
      type: "tool.dice.rolled",
      eventId: "event-1",
      lessonId: "lesson-1",
      requestId: "request-1",
      value: 6,
      rollerSubject: "student-1",
      rollerName: "Alex",
      rolledAt: "2026-08-06T10:00:00Z",
      cooldownUntil: "2026-08-06T10:00:02Z",
    })).toMatchObject({ value: 6, rollerName: "Alex" });

    expect(lessonDiceRoll({
      type: "tool.dice.rolled",
      eventId: "event-2",
      lessonId: "lesson-1",
      requestId: "request-2",
      value: 7,
      rollerSubject: "student-1",
      rollerName: "Alex",
      rolledAt: "2026-08-06T10:00:00Z",
      cooldownUntil: "2026-08-06T10:00:02Z",
    })).toBeNull();
  });

  it("accepts only known rejection codes", () => {
    expect(lessonDiceRejection({
      type: "tool.dice.rejected",
      lessonId: "lesson-1",
      requestId: "request-1",
      code: "COOLDOWN",
      retryAt: "2026-08-06T10:00:02Z",
    })).toEqual({
      code: "COOLDOWN",
      lessonId: "lesson-1",
      requestId: "request-1",
      retryAt: "2026-08-06T10:00:02Z",
    });
    expect(lessonDiceRejection({ type: "tool.dice.rejected", code: "UNKNOWN" })).toBeNull();
  });
});

function lesson(status: string): ScheduledLesson {
  return {
    createdAt: "2026-07-18T10:00:00Z",
    id: "lesson-1",
    inheritTemplateMaterial: false,
    participants: [],
    scheduledEnd: "2026-07-19T07:45:00Z",
    scheduledStart: "2026-07-19T07:00:00Z",
    status,
    type: "INDIVIDUAL",
    updatedAt: "2026-07-18T10:00:00Z",
    workMode: "SHARED",
  };
}
