import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type { AdminUserProfile, LessonMaterial } from "../../../shared/api/playsay";
import type { CourseLessonOption } from "../../../entities/schedule/model";
import { ScheduleCreateForm } from "./ScheduleCreateForm";

describe("ScheduleCreateForm", () => {
  it("keeps the teacher quick-create path focused on student time duration and material", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <ScheduleCreateForm
          disabled={false}
          lessonOptions={lessonOptions}
          materials={materials}
          onCreate={() => undefined}
          studentUsers={studentUsers}
        />
      </AppProviders>,
    );

    expect(markup).toContain('data-schedule-quick-create="true"');
    expect(markup).toContain('name="scheduledDate"');
    expect(markup).toContain('name="scheduledTime"');
    expect(markup).toContain('name="durationMinutes"');
    expect(markup).toContain('data-schedule-recurrence="true"');
    expect(markup).toContain('name="recurrenceMode"');
    expect(markup).toContain('data-schedule-advanced="true"');
    expect(markup.indexOf('name="studentSubjects"')).toBeLessThan(markup.indexOf('data-schedule-advanced="true"'));
    expect(markup.indexOf('name="durationMinutes"')).toBeLessThan(markup.indexOf('data-schedule-advanced="true"'));
    expect(markup.indexOf('name="recurrenceMode"')).toBeLessThan(markup.indexOf('data-schedule-advanced="true"'));
    expect(markup.indexOf('name="workMode"')).toBeGreaterThan(markup.indexOf('data-schedule-advanced="true"'));
  });
});

const lessonOptions: CourseLessonOption[] = [
  {
    id: "lesson-template-1",
    label: "Starter · 1. Hello",
    materialId: "material-1",
  },
];

const materials = [
  {
    id: "material-1",
    title: "Hello cards",
    status: "PUBLISHED",
  },
] as LessonMaterial[];

const studentUsers = [
  {
    subject: "student-1",
    username: "student.one",
    displayName: "Student One",
  },
] as AdminUserProfile[];
