import { describe, expect, it } from "vitest";
import type { ScheduledLesson } from "../../shared/api/playsay";
import { realtimeClassroomClosureMessageKey } from "./useLessonRealtime";

describe("lesson realtime classroom closure", () => {
  it("uses the reschedule explanation when an in-progress room returns to scheduled", () => {
    expect(realtimeClassroomClosureMessageKey(lesson("SCHEDULED"), "IN_PROGRESS"))
      .toBe("schedule.messages.rescheduledClassroomClosed");
    expect(realtimeClassroomClosureMessageKey(lesson("COMPLETED"), "IN_PROGRESS"))
      .toBe("schedule.messages.finishedOrCancelled");
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
