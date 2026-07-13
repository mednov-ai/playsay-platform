import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type { AdminUserProfile, LessonMaterial } from "../../../shared/api/playsay";
import type { CourseLessonOption } from "../../../entities/schedule/model";
import {
  ScheduleCreateForm,
  ScheduleStudentPickerDialog,
  managedStudentInputFromDraft,
  selectedSubjectsAfterManagedStudentCreation,
} from "./ScheduleCreateForm";

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
    expect(markup).toContain('data-schedule-student-picker="summary"');
    expect(markup).toContain('data-schedule-student-picker-open="true"');
    expect(markup).not.toContain("max-h-52");
    expect(markup).not.toContain('role="dialog"');
    expect(markup).toContain('name="scheduledDate"');
    expect(markup).toContain('name="scheduledTime"');
    expect(markup).toContain('name="durationMinutes"');
    expect(markup).toContain('data-schedule-time-grid="true"');
    expect(markup).toContain('data-schedule-duration-field="true"');
    expect(markup).toContain('data-schedule-duration-presets="true"');
    expect(markup).toContain('data-schedule-duration-stepper="true"');
    expect(markup).toContain(">30</button>");
    expect(markup).toContain(">45</button>");
    expect(markup).toContain(">60</button>");
    expect(markup).toContain(">90</button>");
    expect(markup).toContain('data-schedule-recurrence="true"');
    expect(markup).toContain('name="recurrenceMode"');
    expect(markup).toContain('data-schedule-recurrence-mode="single"');
    expect(markup).toContain('data-schedule-recurrence-mode="weekly"');
    expect(markup).toContain('data-schedule-advanced="true"');
    expect(markup).toContain('data-schedule-create-reason="student"');
    expect(markup).toContain("Сначала выберите ученика");
    expect(markup).not.toContain("Длительность, мин");
    expect(markup).not.toContain("Повтор");
    expect(markup).not.toContain("Занятий");
    expect(markup.indexOf('name="studentSubjects"')).toBeLessThan(markup.indexOf('data-schedule-advanced="true"'));
    expect(markup.indexOf('name="durationMinutes"')).toBeLessThan(markup.indexOf('data-schedule-advanced="true"'));
    expect(markup.indexOf('name="recurrenceMode"')).toBeLessThan(markup.indexOf('data-schedule-advanced="true"'));
    expect(markup.indexOf('name="workMode"')).toBeGreaterThan(markup.indexOf('data-schedule-advanced="true"'));
  });

  it("renders a searchable modal picker for selecting students", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <ScheduleStudentPickerDialog
          disabled={false}
          draftSubjects={["student-1"]}
          onApply={() => undefined}
          onClose={() => undefined}
          onDraftSubjectsChange={() => undefined}
          onSearchQueryChange={() => undefined}
          open
          searchQuery="one"
          studentUsers={studentUsers}
        />
      </AppProviders>,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('name="studentSearch"');
    expect(markup).toContain('name="studentPickerSubjects"');
    expect(markup).toContain("Student One");
    expect(markup).toContain("@student.one");
    expect(markup).not.toContain("Student Two");
    expect(markup).toContain("Применить");
    expect(markup).toContain("Отмена");
  });

  it("renders managed student creation inside the student picker", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <ScheduleStudentPickerDialog
          disabled={false}
          draftSubjects={[]}
          onApply={() => undefined}
          onClose={() => undefined}
          onCreateManagedStudent={() => Promise.resolve(null)}
          onDraftSubjectsChange={() => undefined}
          onSearchQueryChange={() => undefined}
          open
          searchQuery=""
          studentUsers={[]}
        />
      </AppProviders>,
    );

    expect(markup).toContain('data-schedule-managed-student-form="true"');
    expect(markup).toContain("Новый ученик");
    expect(markup).toContain("Логин");
    expect(markup).toContain("Имя");
    expect(markup).toContain("Фамилия (необязательно)");
    expect(markup).toContain("Email (необязательно)");
    expect(markup).toContain('pattern="[A-Za-z0-9._\\-]{3,64}"');
    expect(markup).toContain('type="email"');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*type="submit"/);
  });

  it("normalizes the managed student payload and omits optional blank fields", () => {
    expect(managedStudentInputFromDraft({
      username: "  Young.Learner ",
      firstName: " Mia ",
      lastName: " ",
      email: " ",
    })).toEqual({ username: "young.learner", firstName: "Mia" });

    expect(managedStudentInputFromDraft({
      username: " Young.Learner ",
      firstName: " Mia ",
      lastName: " Stone ",
      email: " MIA@EXAMPLE.COM ",
    })).toEqual({
      username: "young.learner",
      firstName: "Mia",
      lastName: "Stone",
      email: "mia@example.com",
    });
    expect(managedStudentInputFromDraft({
      username: "bad login",
      firstName: "Mia",
      lastName: "",
      email: "",
    })).toBeNull();
  });

  it("automatically adds a created managed student once", () => {
    expect(selectedSubjectsAfterManagedStudentCreation(["student-1"], "student-2"))
      .toEqual(["student-1", "student-2"]);
    expect(selectedSubjectsAfterManagedStudentCreation(["student-1"], "student-1"))
      .toEqual(["student-1"]);
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
  {
    subject: "student-2",
    username: "student.two",
    displayName: "Student Two",
  },
] as AdminUserProfile[];
