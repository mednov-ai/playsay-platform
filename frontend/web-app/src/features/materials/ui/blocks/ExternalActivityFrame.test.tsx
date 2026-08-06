import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExternalActivityFrame, externalActivityPoint } from "./ExternalActivityFrame";

describe("ExternalActivityFrame", () => {
  it("maps input against the visible contain-fitted video instead of its letterbox", () => {
    expect(externalActivityPoint({
      clientX: 180,
      clientY: 450,
      surface: { height: 900, left: 0, top: 0, width: 1440 },
      videoHeight: 900,
      videoWidth: 1080,
    })).toEqual({
      normalizedX: 0,
      normalizedY: 0.5,
      sourceHeight: 900,
      sourceWidth: 1080,
      x: 0,
      y: 450,
    });

    expect(externalActivityPoint({
      clientX: 720,
      clientY: 450,
      surface: { height: 900, left: 0, top: 0, width: 1440 },
      videoHeight: 900,
      videoWidth: 1080,
    })).toEqual({
      normalizedX: 0.5,
      normalizedY: 0.5,
      sourceHeight: 900,
      sourceWidth: 1080,
      x: 540,
      y: 450,
    });
  });

  it("shows the teacher extension action while capture is waiting", () => {
    const markup = renderToStaticMarkup(
      <ExternalActivityFrame
        block={{ id: "external-1", type: "externalActivity", title: "Wordwall", url: "https://wordwall.net/resource/1" }}
        sync={{
          active: { blockId: "external-1", sessionId: "s-1", hostIdentity: "teacher", phase: "AWAITING_EXTENSION", studentsLocked: false, visible: true },
          cursors: [], isHost: true, mediaStream: null, open: vi.fn(), reload: vi.fn(), returnToLesson: vi.fn(),
          sendCursor: vi.fn(), sendInput: vi.fn(),
        }}
      />,
    );

    expect(markup).toContain("data-testid=\"external-activity-waiting\"");
    expect(markup).toContain("Обновить");
    expect(markup).toContain("Вернуться к уроку");
    expect(markup).not.toContain("Заблокировать учеников");
    expect(markup).not.toContain("Завершить показ");
    expect(markup).not.toContain("<iframe");
  });
});
