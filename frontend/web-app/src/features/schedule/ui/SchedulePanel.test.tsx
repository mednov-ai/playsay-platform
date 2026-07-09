import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type { MeProfile, ScheduledLesson } from "../../../shared/api/playsay";
import { SchedulePanel } from "./SchedulePanel";

describe("SchedulePanel", () => {
  it("keeps expired lessons out of the primary teacher schedule", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <SchedulePanel
          courses={[]}
          disabled={false}
          lessons={{}}
          loading={false}
          materials={[]}
          message={null}
          nowMs={Date.parse("2026-06-27T10:00:00.000Z")}
          onCancel={() => undefined}
          onComplete={() => undefined}
          onCopyLinks={() => Promise.resolve(true)}
          onCreate={() => undefined}
          onCreateManagedStudent={() => Promise.resolve(null)}
          onDelete={() => undefined}
          onJoin={() => undefined}
          onRefresh={() => undefined}
          profile={teacherProfile}
          roomLoadingLessonId={null}
          roomMessage={null}
          scheduledLessons={[expiredLesson]}
          studentUsers={[]}
        />
      </AppProviders>,
    );

    expect(markup).toContain('data-schedule-primary-list="true"');
    expect(markup).toContain('data-schedule-archive="true"');
    expect(markup).toContain("Ближайших занятий нет");
    expect(markup.indexOf("Ближайших занятий нет")).toBeLessThan(markup.indexOf("Expired demo lesson"));
    expect(markup).toContain("Истёк");
  });
});

const teacherProfile = {
  roles: ["TEACHER"],
  subject: "teacher-demo",
  username: "teacher-demo",
} as MeProfile;

const expiredLesson = {
  courseTitle: "Demo course",
  createdAt: "2026-06-01T00:00:00.000Z",
  id: "lesson-expired",
  lessonTitle: "Expired demo lesson",
  materialTitle: "Demo material",
  participants: [],
  scheduledEnd: "2026-06-25T10:45:00.000Z",
  scheduledStart: "2026-06-25T10:00:00.000Z",
  status: "SCHEDULED",
  teacherName: "Teacher Demo",
  type: "GROUP",
  updatedAt: "2026-06-01T00:00:00.000Z",
  workMode: "SHARED",
} as ScheduledLesson;
