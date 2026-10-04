import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { invalidateServerClock, observeServerTime, resetServerClock, serverClockSynchronized, serverNowMs } from "./serverClock";
import { isRoomSessionExpired, roomSessionFromScheduledLesson, type LessonRoomSession } from "../../features/classroom/model/session";
import type { ScheduledLesson } from "../api/playsay";

describe("server-authoritative lesson clock", () => {
  beforeEach(() => resetServerClock());
  afterEach(() => vi.restoreAllMocks());
  it("does not infer a deadline before a server sample", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2099-01-01"));
    expect(serverNowMs()).toBeNaN();
    expect(serverClockSynchronized()).toBe(false);
  });
  it("uses monotonic elapsed time despite wall clock changes and rejects older samples", () => {
    const monotonic = vi.spyOn(performance, "now").mockReturnValue(100);
    const server = Date.parse("2026-10-04T07:23:00Z");
    observeServerTime({ serverNow: new Date(server).toISOString() });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2099-01-01"));
    monotonic.mockReturnValue(60100);
    expect(serverNowMs()).toBe(server + 60000);
    observeServerTime({ serverNow: "2026-10-04T07:00:00Z" });
    expect(serverNowMs()).toBe(server + 60000);
    invalidateServerClock();
    expect(serverClockSynchronized()).toBe(false);
    observeServerTime({ serverNow: "2026-10-04T07:24:00Z" });
    expect(serverClockSynchronized()).toBe(true);
  });
  it("keeps an extended room open beyond the original cutoff and rejects stale revisions", () => {
    const session = { lessonId: "lesson-1", lessonStatus: "IN_PROGRESS", lessonEndsAt: "2026-10-04T07:15:00Z", accessEndsAt: "2026-10-04T07:35:00Z", accessRevision: 1 } as LessonRoomSession;
    expect(isRoomSessionExpired(session, Date.parse("2026-10-04T07:26:00Z"))).toBe(false);
    expect(isRoomSessionExpired(session, Date.parse("2026-10-04T07:35:00Z"))).toBe(true);
    const stale = { id: "lesson-1", accessRevision: 0, accessEndsAt: "2026-10-04T07:25:00Z" } as ScheduledLesson;
    expect(roomSessionFromScheduledLesson(session, stale)).toBe(session);
  });
});
