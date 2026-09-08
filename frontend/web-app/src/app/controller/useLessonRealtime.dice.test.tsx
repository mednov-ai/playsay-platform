// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonRoomSession } from "../../features/classroom";
import type { MeProfile } from "../../shared/api/playsay";
import { useLessonRealtime } from "./useLessonRealtime";

const apiMocks = vi.hoisted(() => ({
  fetchScheduledLessons: vi.fn(),
  getValidAccessToken: vi.fn(),
}));

vi.mock("../../shared/api/playsay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../shared/api/playsay")>()),
  fetchScheduledLessons: apiMocks.fetchScheduledLessons,
  getValidAccessToken: apiMocks.getValidAccessToken,
}));

vi.mock("../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

const sockets: FakeWebSocket[] = [];

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readonly sent: string[] = [];
  readyState = FakeWebSocket.CONNECTING;
  throwOnSend = false;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;

  constructor(_url: string, _protocols: string[]) {
    sockets.push(this);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  send(payload: string) {
    if (this.throwOnSend) throw new Error("send failed");
    this.sent.push(payload);
  }
}

describe("useLessonRealtime dice delivery", () => {
  beforeEach(() => {
    sockets.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
    apiMocks.getValidAccessToken.mockResolvedValue("token");
    apiMocks.fetchScheduledLessons.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sends one request for repeated taps and clears pending on the matching result", async () => {
    const { result, unmount } = await renderDiceHook();
    const socket = sockets[0];
    act(() => socket.open());
    socket.sent.length = 0;

    act(() => {
      result.current.dice.roll();
      result.current.dice.roll();
    });

    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([{
      lessonId: "lesson-1",
      requestId: "00000000-0000-4000-8000-000000000001",
      type: "tool.dice.roll",
    }]);
    expect(result.current.dice.pending).toBe(true);

    act(() => socket.receive(diceRoll()));

    expect(result.current.dice.pending).toBe(false);
    expect(result.current.dice.lastRoll?.value).toBe(4);
    expect(result.current.dice.deliveryError).toBeNull();
    unmount();
  });

  it("reports unavailable when send throws instead of silently losing the roll", async () => {
    const { result, unmount } = await renderDiceHook();
    const socket = sockets[0];
    act(() => socket.open());
    socket.throwOnSend = true;

    act(() => result.current.dice.roll());

    expect(result.current.dice.pending).toBe(false);
    expect(result.current.dice.connectionAvailable).toBe(false);
    expect(result.current.dice.deliveryError).toBe("UNAVAILABLE");
    unmount();
  });

  it("ends an unanswered request after ten seconds and still accepts a late result", async () => {
    const { result, unmount } = await renderDiceHook();
    const socket = sockets[0];
    act(() => socket.open());
    act(() => result.current.dice.roll());

    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.dice.pending).toBe(false);
    expect(result.current.dice.deliveryError).toBe("UNCONFIRMED");

    act(() => socket.receive(diceRoll()));
    expect(result.current.dice.lastRoll?.value).toBe(4);
    expect(result.current.dice.deliveryError).toBeNull();
    unmount();
  });

  it("expires throttled mobile waiting on pageshow and never resends automatically", async () => {
    const { result, unmount } = await renderDiceHook();
    const socket = sockets[0];
    act(() => socket.open());
    socket.sent.length = 0;
    act(() => result.current.dice.roll());
    const sentCount = socket.sent.length;

    vi.setSystemTime(Date.now() + 10_001);
    act(() => window.dispatchEvent(new Event("pageshow")));

    expect(result.current.dice.pending).toBe(false);
    expect(result.current.dice.deliveryError).toBe("UNCONFIRMED");
    expect(socket.sent).toHaveLength(sentCount);
    unmount();
  });

  it("keeps the current request pending for unrelated events and clears it on server rejection", async () => {
    const { result, unmount } = await renderDiceHook();
    const socket = sockets[0];
    act(() => socket.open());
    act(() => result.current.dice.roll());

    act(() => socket.receive({ ...diceRoll(), requestId: "another-request" }));
    expect(result.current.dice.pending).toBe(true);

    act(() => socket.receive({
      code: "COOLDOWN",
      lessonId: "lesson-1",
      requestId: "00000000-0000-4000-8000-000000000001",
      retryAt: "2026-09-07T20:00:02Z",
      type: "tool.dice.rejected",
    }));

    expect(result.current.dice.pending).toBe(false);
    expect(result.current.dice.rejection?.code).toBe("COOLDOWN");
    unmount();
  });

  it("clears pending when the socket disconnects and ignores another lesson result", async () => {
    const { result, unmount } = await renderDiceHook();
    const socket = sockets[0];
    act(() => socket.open());
    act(() => result.current.dice.roll());
    act(() => socket.receive({ ...diceRoll(), lessonId: "lesson-2" }));

    expect(result.current.dice.pending).toBe(true);
    expect(result.current.dice.lastRoll).toBeNull();

    act(() => socket.close());
    expect(result.current.dice.pending).toBe(false);
    expect(result.current.dice.deliveryError).toBe("UNAVAILABLE");
    unmount();
  });

  it("restores a snapshot without presenting it as a new live roll", async () => {
    const { result, unmount } = await renderDiceHook();
    const socket = sockets[0];
    act(() => socket.open());

    act(() => socket.receive({ ...diceRoll(), type: "tool.dice.snapshot" }));

    expect(result.current.dice.lastRoll?.value).toBe(4);
    expect(result.current.dice.liveRoll).toBeNull();
    unmount();
  });

  it("clears a pending roll when the active lesson changes", async () => {
    const baseProps = diceHookProps();
    const { result, rerender, unmount } = renderHook(
      ({ roomSession }: { roomSession: LessonRoomSession }) => useLessonRealtime({ ...baseProps, roomSession }),
      { initialProps: { roomSession: { lessonId: "lesson-1" } as LessonRoomSession } },
    );
    await act(async () => Promise.resolve());
    const socket = sockets[0];
    act(() => socket.open());
    act(() => result.current.dice.roll());
    expect(result.current.dice.pending).toBe(true);

    rerender({ roomSession: { lessonId: "lesson-2" } as LessonRoomSession });

    expect(result.current.dice.pending).toBe(false);
    act(() => socket.receive(diceRoll()));
    expect(result.current.dice.lastRoll).toBeNull();
    unmount();
  });
});

async function renderDiceHook() {
  const rendered = renderHook(() => useLessonRealtime(diceHookProps()));
  await act(async () => Promise.resolve());
  expect(sockets).toHaveLength(1);
  return rendered;
}

function diceHookProps() {
  return {
    applySessionError: vi.fn(),
    classroomLessonId: "lesson-1",
    closeClassroom: vi.fn(),
    nowMs: Date.now(),
    profile: { roles: ["TEACHER"] } as MeProfile,
    roomSession: { lessonId: "lesson-1" } as LessonRoomSession,
    setRoomSession: vi.fn(),
    setScheduleMessage: vi.fn(),
    setScheduledLessons: vi.fn(),
    status: "authenticated" as const,
  };
}

function diceRoll() {
  return {
    cooldownUntil: "2026-09-07T20:00:02Z",
    eventId: "event-1",
    lessonId: "lesson-1",
    requestId: "00000000-0000-4000-8000-000000000001",
    rolledAt: "2026-09-07T20:00:00Z",
    rollerName: "Alex",
    rollerSubject: "teacher-1",
    type: "tool.dice.rolled",
    value: 4,
  };
}
