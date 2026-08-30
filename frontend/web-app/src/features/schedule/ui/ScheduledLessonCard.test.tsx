import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type { ScheduledLesson } from "../../../shared/api/playsay";
import { ScheduledLessonCard } from "./ScheduledLessonCard";

describe("ScheduledLessonCard", () => {
  it("offers lesson preparation before the live access window", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <ScheduledLessonCard
          canManage
          disabled={false}
          lesson={lesson({
            scheduledStart: "2026-05-28T12:00:00.000Z",
            scheduledEnd: "2026-05-28T12:45:00.000Z",
          })}
          linkCopied={false}
          nowMs={Date.parse("2026-05-28T10:00:00.000Z")}
          onCancel={() => undefined}
          onComplete={() => undefined}
          onCopyLink={() => undefined}
          onDelete={() => undefined}
          onJoin={() => undefined}
          onStart={() => undefined}
          roomLoading={false}
        />
      </AppProviders>,
    );

    expect(markup).not.toContain('disabled=""');
    expect(markup).not.toContain("Войти в урок");
    expect(markup).toContain("Подготовить урок");
  });

  it("labels the copy action as participant links for teachers", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <ScheduledLessonCard
          canManage
          disabled={false}
          lesson={lesson({})}
          linkCopied={false}
          nowMs={Date.parse("2026-05-28T10:00:00.000Z")}
          onCancel={() => undefined}
          onComplete={() => undefined}
          onCopyLink={() => undefined}
          onDelete={() => undefined}
          onJoin={() => undefined}
          onStart={() => undefined}
          roomLoading={false}
        />
      </AppProviders>,
    );

    expect(markup).toContain("honeyschool.ru");
    expect(markup).toContain("honey.school");
  });

  it("promotes direct lesson start during the live access window", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <ScheduledLessonCard
          canManage
          disabled={false}
          lesson={lesson({
            scheduledStart: "2026-05-28T10:10:00.000Z",
            scheduledEnd: "2026-05-28T10:55:00.000Z",
          })}
          linkCopied={false}
          nowMs={Date.parse("2026-05-28T10:00:00.000Z")}
          onCancel={() => undefined}
          onComplete={() => undefined}
          onCopyLink={() => undefined}
          onDelete={() => undefined}
          onJoin={() => undefined}
          onStart={() => undefined}
          roomLoading={false}
        />
      </AppProviders>,
    );

    expect(markup).toContain('data-lesson-action="start"');
    expect(markup).toContain('data-lesson-invite-location="card"');
    expect(markup).toContain("Начать урок");
    expect(markup).toContain("Подготовить");
    expect(markup).toContain("Пора начинать");
  });

  it("does not present a future in-progress lesson as live or joinable", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <ScheduledLessonCard
          canManage
          disabled={false}
          lesson={lesson({
            status: "IN_PROGRESS",
            scheduledStart: "2026-05-29T10:00:00.000Z",
            scheduledEnd: "2026-05-29T10:45:00.000Z",
          })}
          linkCopied={false}
          nowMs={Date.parse("2026-05-28T10:00:00.000Z")}
          onCancel={() => undefined}
          onComplete={() => undefined}
          onCopyLink={() => undefined}
          onDelete={() => undefined}
          onJoin={() => undefined}
          onStart={() => undefined}
          roomLoading={false}
        />
      </AppProviders>,
    );

    expect(markup).toContain("Запланирован");
    expect(markup).toContain("Подготовить урок");
    expect(markup).not.toContain("В эфире");
    expect(markup).not.toContain("Войти в урок");
  });
});

function lesson(patch: Partial<ScheduledLesson>): ScheduledLesson {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "lesson-1",
    inheritTemplateMaterial: false,
    lessonTitle: "Starter speaking",
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
