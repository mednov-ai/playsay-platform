// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LessonDiceController } from "../../classroom";
import type { MeProfile } from "../../../shared/api/playsay";
import { GlobalToolsRail } from "./GlobalToolsRail";

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) => key,
  }),
}));

vi.mock("../model/useChatPushSubscription", () => ({
  useChatPushSubscription: () => ({
    disable: vi.fn(),
    enable: vi.fn(),
    state: "unsupported",
  }),
}));

vi.mock("../api/chatApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/chatApi")>()),
  fetchChatContacts: vi.fn().mockResolvedValue([]),
  fetchChatConversations: vi.fn().mockResolvedValue([]),
  fetchChatMessages: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  markChatRead: vi.fn().mockResolvedValue(undefined),
  openChatSocket: vi.fn().mockResolvedValue(null),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GlobalToolsRail dice interaction", () => {
  it("opens from the dotted dice icon and invokes one explicit roll", () => {
    const roll = vi.fn();
    const { container } = render(<GlobalToolsRail classroomDice={dice({ roll })} profile={profile} />);

    fireEvent.click(screen.getByRole("button", { name: "dice.open" }));
    expect(container.querySelectorAll('svg[data-initial="true"]')).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "dice.roll" }));
    expect(roll).toHaveBeenCalledOnce();
  });

  it("blocks another touch while waiting and exposes delivery feedback", () => {
    const roll = vi.fn();
    const { rerender } = render(<GlobalToolsRail classroomDice={dice({ pending: true, roll })} profile={profile} />);
    fireEvent.click(screen.getByRole("button", { name: "dice.open" }));

    const pendingButton = screen.getByRole("button", { name: "dice.pending" });
    expect((pendingButton as HTMLButtonElement).disabled).toBe(true);
    expect(pendingButton.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(pendingButton);
    expect(roll).not.toHaveBeenCalled();

    rerender(<GlobalToolsRail classroomDice={dice({ connectionAvailable: false, deliveryError: "UNAVAILABLE", roll })} profile={profile} />);
    expect(screen.getByRole("alert").textContent).toBe("dice.errors.UNAVAILABLE");
    expect((screen.getByRole("button", { name: "dice.roll" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("preserves the server cooldown after a confirmed result", () => {
    render(<GlobalToolsRail classroomDice={dice({
      lastRoll: {
        cooldownUntil: new Date(Date.now() + 10_000).toISOString(),
        eventId: "event-1",
        lessonId: "lesson-1",
        requestId: "request-1",
        rolledAt: new Date().toISOString(),
        rollerName: "Maria",
        rollerSubject: "teacher-1",
        value: 4,
      },
    })} profile={profile} />);
    fireEvent.click(screen.getByRole("button", { name: /dice\.aria\.valueCooling/ }));

    expect((screen.getByRole("button", { name: "dice.cooldown" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

const profile = {
  roles: ["TEACHER"],
  subject: "teacher-1",
} as MeProfile;

function dice(overrides: Partial<LessonDiceController> = {}): LessonDiceController {
  return {
    connectionAvailable: true,
    deliveryError: null,
    lastRoll: null,
    liveRoll: null,
    pending: false,
    rejection: null,
    roll: vi.fn(),
    ...overrides,
  };
}
