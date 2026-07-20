import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExternalActivityFrame } from "./ExternalActivityFrame";

describe("ExternalActivityFrame", () => {
  it("shows the teacher extension action while capture is waiting", () => {
    const markup = renderToStaticMarkup(
      <ExternalActivityFrame
        block={{ id: "external-1", type: "externalActivity", title: "Wordwall", url: "https://wordwall.net/resource/1" }}
        sync={{
          active: { blockId: "external-1", sessionId: "s-1", hostIdentity: "teacher", phase: "AWAITING_EXTENSION", studentsLocked: false, visible: true },
          back: vi.fn(), collapse: vi.fn(), cursors: [], isHost: true, mediaStream: null, open: vi.fn(), reload: vi.fn(),
          sendCursor: vi.fn(), sendInput: vi.fn(), setStudentsLocked: vi.fn(), stop: vi.fn(),
        }}
      />,
    );

    expect(markup).toContain("data-testid=\"external-activity-waiting\"");
    expect(markup).not.toContain("<iframe");
  });
});
