// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://online.honey.school/" }

import { renderToStaticMarkup } from "react-dom/server";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScheduledLesson } from "../../../shared/api/playsay";
import { ScheduledLessonCard } from "./ScheduledLessonCard";

vi.mock("../../../shared/i18n", async () => {
  const { ru } = await import("../../../shared/i18n/resources/ru");
  return {
    useAppTranslation: () => ({
      t: (key: string) => key.split(".").reduce<unknown>((value, part) => (
        typeof value === "object" && value != null ? (value as Record<string, unknown>)[part] : undefined
      ), ru) ?? key,
    }),
  };
});

describe("ScheduledLessonCard", () => {
  it("offers lesson preparation before the live access window", () => {
    const markup = renderToStaticMarkup(
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
          showProductionLinkOrigins={false}
      />,
    );

    expect(markup).not.toContain('disabled=""');
    expect(markup).not.toContain("Войти в урок");
    expect(markup).toContain("Подготовить урок");
  });

  it("labels the copy action as participant links for teachers", () => {
    const onCopyLink = vi.fn();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 180 });
    const view = render(
      <ScheduledLessonCard
          canManage
          disabled={false}
          lesson={lesson({})}
          linkCopied={false}
          nowMs={Date.parse("2026-05-28T10:00:00.000Z")}
          onCancel={() => undefined}
          onComplete={() => undefined}
          onCopyLink={onCopyLink}
          onDelete={() => undefined}
          onJoin={() => undefined}
          onStart={() => undefined}
          roomLoading={false}
          showProductionLinkOrigins
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Ещё действия" }));
    expect(view.getByRole("menuitem", { name: "Ссылки · honeyschool.ru" })).toBeTruthy();
    expect(view.getByRole("menuitem", { name: "Ссылки · honey.school" })).toBeTruthy();
    fireEvent.click(view.getByRole("menuitem", { name: "Ссылки · honeyschool.ru" }));
    expect(onCopyLink).toHaveBeenLastCalledWith("HONEYSCHOOL_RU");
    expect(window.scrollY).toBe(180);

    fireEvent.click(view.getByRole("button", { name: "Ещё действия" }));
    fireEvent.click(view.getByRole("menuitem", { name: "Ссылки · honey.school" }));
    expect(onCopyLink).toHaveBeenLastCalledWith("HONEY_SCHOOL");
    expect(window.scrollY).toBe(180);
  });

  it("promotes direct lesson start during the live access window", () => {
    const markup = renderToStaticMarkup(
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
          showProductionLinkOrigins={false}
      />,
    );

    expect(markup).toContain('data-lesson-action="start"');
    expect(markup).toContain('data-lesson-invite-location="card"');
    expect(markup).toContain("Начать урок");
    expect(markup).toContain("Подготовить");
    expect(markup).toContain("Пора начинать");
  });

  it("does not present a future in-progress lesson as live or joinable", () => {
    const markup = renderToStaticMarkup(
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
          showProductionLinkOrigins={false}
      />,
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
