// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonRoomSession } from "../../features/classroom";
import type { MeProfile, ScheduledLesson } from "../../shared/api/playsay";
import { observeServerTime, resetServerClock } from "../../shared/lib/serverClock";
import { useLessonRealtime } from "./useLessonRealtime";
const api = vi.hoisted(() => ({ fetchScheduledLessons: vi.fn(), getValidAccessToken: vi.fn() }));
vi.mock("../../shared/api/playsay", async (original) => ({ ...await original<typeof import("../../shared/api/playsay")>(), ...api }));
vi.mock("../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));
const now = Date.parse("2026-10-11T09:00:00Z");
const sockets: Socket[] = [];
class Socket {
  static CONNECTING = 0; static OPEN = 1; static CLOSED = 3;
  readyState = Socket.CONNECTING;
  onopen: (() => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor() { sockets.push(this); }
  send() {}
  open() { this.readyState = Socket.OPEN; this.onopen?.(); }
  close() { this.readyState = Socket.CLOSED; this.onclose?.(); }
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
function lesson(patch: Partial<ScheduledLesson> = {}): ScheduledLesson {
  return { id: "planned", status: "SCHEDULED", scheduledStart: "2026-10-12T09:00:00Z", scheduledEnd: "2026-10-12T09:45:00Z",
    accessEndsAt: "2026-10-12T09:55:00Z", serverNow: new Date(now).toISOString(), accessRevision: 0, accessAllowed: false,
    participants: [], inheritTemplateMaterial: false, type: "INDIVIDUAL", workMode: "SHARED",
    createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), ...patch };
}
function mount(initial: ScheduledLesson[], roles = ["STUDENT"], room: LessonRoomSession | null = null) {
  const closeClassroom = vi.fn();
  const rendered = renderHook(({ time }) => {
    const [schedule, setScheduledLessons] = useState(initial);
    const [roomSession, setRoomSession] = useState(room);
    useLessonRealtime({ nowMs: time, profile: { roles } as MeProfile, status: "authenticated", roomSession,
      classroomLessonId: room?.lessonId ?? null, setRoomSession, setScheduledLessons,
      setScheduleMessage: vi.fn(), closeClassroom, applySessionError: vi.fn() });
    return schedule;
  }, { initialProps: { time: now } });
  return { ...rendered, closeClassroom };
}
async function settle(action: () => void = () => {}) { await act(async () => { action(); }); }
function tick(r: ReturnType<typeof mount>) { for (let i = 1; i <= 3; i++) r.rerender({ time: now + i * 1000 }); }
describe("student schedule visibility", () => {
  beforeEach(() => {
    resetServerClock(); observeServerTime({ serverNow: new Date(now).toISOString() }); sockets.length = 0;
    vi.useFakeTimers(); vi.stubGlobal("WebSocket", Socket); api.fetchScheduledLessons.mockReset().mockResolvedValue([]);
    api.getValidAccessToken.mockResolvedValue("test-token");
  });
  afterEach(() => { resetServerClock(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
  it("keeps tomorrow's lesson before first entry through repeated ticks and reload", () => {
    const planned = lesson(); const first = mount([planned]); tick(first); expect(first.result.current).toEqual([planned]); first.unmount();
    const reloaded = mount([planned]); tick(reloaded); expect(reloaded.result.current).toEqual([planned]); reloaded.unmount();
  });
  it("keeps scheduled lessons inside the opening window", () => {
    const planned = lesson({ scheduledStart: "2026-10-11T09:05:00Z", scheduledEnd: "2026-10-11T09:50:00Z", accessEndsAt: "2026-10-11T10:00:00Z" });
    const r = mount([planned]); tick(r); expect(r.result.current).toEqual([planned]); r.unmount();
  });
  it("recovers a newly created lesson on schedule.changed and reconnect", async () => {
    const planned = lesson(); const r = mount([]); await settle(); await settle(() => sockets[0].open());
    api.fetchScheduledLessons.mockResolvedValue([planned]); await settle(() => sockets[0].receive({ type: "schedule.changed" }));
    tick(r); expect(r.result.current).toEqual([planned]);
    await settle(() => sockets[0].close()); await settle(() => window.dispatchEvent(new Event("online")));
    await settle(() => sockets[1].open()); tick(r); expect(r.result.current).toEqual([planned]); r.unmount();
  });
  it("does not prune before server clock synchronization despite device clock skew", () => {
    resetServerClock(); vi.spyOn(Date, "now").mockReturnValue(now + 7 * 86400000);
    const planned = lesson(); const r = mount([planned]); tick(r); expect(r.result.current).toEqual([planned]);
    observeServerTime({ serverNow: new Date(now).toISOString() }); tick(r); expect(r.result.current).toEqual([planned]); r.unmount();
  });
  it.each(["TEACHER", "ADMIN"])("preserves the existing %s archive", (role) => {
    const closed = lesson({ status: "COMPLETED" }); const r = mount([closed], [role]); tick(r); expect(r.result.current).toEqual([closed]); r.unmount();
  });
  it("keeps an extension until the exact effective deadline", () => {
    const extended = lesson({ status: "IN_PROGRESS", scheduledStart: "2026-10-11T08:00:00Z", scheduledEnd: "2026-10-11T08:45:00Z", accessEndsAt: "2026-10-11T09:10:00Z" });
    const r = mount([extended]); tick(r); expect(r.result.current).toEqual([extended]);
    r.rerender({ time: Date.parse(extended.accessEndsAt!) }); expect(r.result.current).toEqual([]); r.unmount();
  });
  it("updates the same card at start and preserves it after rescheduling closes the room", async () => {
    const active = lesson({ status: "IN_PROGRESS", scheduledStart: "2026-10-11T08:55:00Z", scheduledEnd: "2026-10-11T09:40:00Z", accessEndsAt: "2026-10-11T09:50:00Z", accessAllowed: true });
    const r = mount([lesson()], ["STUDENT"], { lessonId: active.id, lessonStatus: "IN_PROGRESS", accessRevision: 0 } as LessonRoomSession);
    await settle(); await settle(() => sockets[0].receive({ type: "lesson.updated", lesson: active })); expect(r.result.current).toEqual([active]);
    const planned = lesson({ accessRevision: 1 }); await settle(() => sockets[0].receive({ type: "lesson.updated", lesson: planned }));
    tick(r); expect(r.result.current).toEqual([planned]); expect(r.closeClassroom).toHaveBeenCalledWith("schedule.messages.rescheduledClassroomClosed"); r.unmount();
  });
  it.each(["CANCELLED", "COMPLETED"])("removes %s snapshots", async (status) => {
    const r = mount([lesson()]); await settle(); await settle(() => sockets[0].receive({ type: "lesson.updated", lesson: lesson({ status }) }));
    expect(r.result.current).toEqual([]); r.unmount();
  });
  it("removes deleted lessons and revoked roster entries after authorized recovery", async () => {
    const r = mount([lesson()]); await settle(); await settle(() => sockets[0].receive({ type: "lesson.deleted", lessonId: "planned" })); expect(r.result.current).toEqual([]);
    api.fetchScheduledLessons.mockResolvedValue([lesson()]); await settle(() => sockets[0].receive({ type: "schedule.changed" })); tick(r); expect(r.result.current).toHaveLength(1);
    api.fetchScheduledLessons.mockResolvedValue([]); await settle(() => sockets[0].receive({ type: "schedule.changed" })); expect(r.result.current).toEqual([]); r.unmount();
  });
});
