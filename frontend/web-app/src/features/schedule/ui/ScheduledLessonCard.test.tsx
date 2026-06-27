import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type { ScheduledLesson } from "../../../shared/api/playsay";
import { ScheduledLessonCard } from "./ScheduledLessonCard";

describe("ScheduledLessonCard", () => {
  it("does not render a disabled join CTA when lesson access is closed", () => {
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
          roomLoading={false}
        />
      </AppProviders>,
    );

    expect(markup).not.toContain('disabled=""');
    expect(markup).not.toContain("Войти в урок");
    expect(markup).toContain("Откроется за 10 минут");
  });
});

function lesson(patch: Partial<ScheduledLesson>): ScheduledLesson {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "lesson-1",
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
