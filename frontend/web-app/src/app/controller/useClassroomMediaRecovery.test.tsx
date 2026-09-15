// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { LiveKitRoomToken } from "../../shared/api/types";
import type { LessonRoomSession } from "../../features/classroom";
import { liveKitRoomInstanceKey, mediaCredentialExpirySafetyMarginMs } from "../../features/classroom/model/liveKitRoomOptions";
import { classroomMediaReplacementDeadlineMs, useClassroomMediaRecovery } from "./useClassroomMediaRecovery";

vi.mock("../../shared/api/schedule", () => ({
  enterScheduledLessonRoom: vi.fn(),
}));

const nowMs = Date.parse("2026-09-15T10:00:00Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("useClassroomMediaRecovery", () => {
  it("single-flights repeated expired-credential events and replaces only media fields", async () => {
    const pending = deferred<LiveKitRoomToken>();
    const fetchFreshRoomToken = vi.fn(() => pending.promise);
    const view = renderRecovery(fetchFreshRoomToken, roomSession(nowMs - 1));
    const original = view.result.current.session!;
    const originalKey = sessionKey(original);

    act(() => {
      view.result.current.recovery.onLifecycleChange("reconnecting");
      view.result.current.recovery.onLifecycleChange("disconnected");
    });

    expect(fetchFreshRoomToken).toHaveBeenCalledTimes(1);
    expect(view.result.current.recovery.phase).toBe("refreshing");
    act(() => view.result.current.recovery.onLifecycleChange("connected"));
    expect(view.result.current.recovery.phase).toBe("refreshing");

    await act(async () => pending.resolve(freshToken(nowMs + 15 * 60_000)));

    expect(view.result.current.recovery.phase).toBe("connecting");
    expect(sessionKey(view.result.current.session!)).not.toBe(originalKey);
    expect(view.result.current.session).toMatchObject({
      courseTitle: original.courseTitle,
      lessonId: original.lessonId,
      materialId: original.materialId,
      mediaChoices: original.mediaChoices,
      participantPresence: original.participantPresence,
      token: "fresh-token",
    });
  });

  it("leaves safely valid transient reconnects to LiveKit and never refreshes healthy media just because time passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    const fetchFreshRoomToken = vi.fn();
    const expiresAtMs = nowMs + 5 * 60_000;
    const view = renderRecovery(fetchFreshRoomToken, roomSession(expiresAtMs));

    act(() => view.result.current.recovery.onLifecycleChange("reconnecting"));
    expect(fetchFreshRoomToken).not.toHaveBeenCalled();
    act(() => view.result.current.recovery.onLifecycleChange("connected"));
    act(() => vi.advanceTimersByTime(10 * 60_000));

    expect(fetchFreshRoomToken).not.toHaveBeenCalled();
    expect(view.result.current.recovery.phase).toBe("idle");
  });

  it("escalates an ongoing valid reconnect once it reaches the safety margin", () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    const fetchFreshRoomToken = vi.fn(() => new Promise<LiveKitRoomToken>(() => undefined));
    const expiresAtMs = nowMs + mediaCredentialExpirySafetyMarginMs + 5_000;
    const view = renderRecovery(fetchFreshRoomToken, roomSession(expiresAtMs));

    act(() => view.result.current.recovery.onLifecycleChange("reconnecting"));
    act(() => vi.advanceTimersByTime(4_999));
    expect(fetchFreshRoomToken).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));

    expect(fetchFreshRoomToken).toHaveBeenCalledTimes(1);
    expect(view.result.current.recovery.phase).toBe("refreshing");
  });

  it("invalidates a pending completion on leave and lesson replacement", async () => {
    const first = deferred<LiveKitRoomToken>();
    const second = deferred<LiveKitRoomToken>();
    const fetchFreshRoomToken = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const view = renderRecovery(fetchFreshRoomToken, roomSession(nowMs - 1));

    act(() => view.result.current.recovery.onLifecycleChange("reconnecting"));
    act(() => {
      view.result.current.recovery.cancel();
      view.result.current.setSession(null);
    });
    await act(async () => first.resolve(freshToken(nowMs + 15 * 60_000)));
    expect(view.result.current.session).toBeNull();
    expect(view.result.current.recovery.phase).toBe("idle");

    act(() => view.result.current.setSession({ ...roomSession(nowMs - 1), lessonId: "lesson-2" }));
    act(() => view.result.current.recovery.onLifecycleChange("disconnected"));
    act(() => view.result.current.setSession({ ...roomSession(nowMs - 1), lessonId: "lesson-3" }));
    await act(async () => second.resolve(freshToken(nowMs + 15 * 60_000)));

    expect(view.result.current.session?.lessonId).toBe("lesson-3");
    expect(view.result.current.session?.token).toBe("old-token");
  });

  it("invalidates an older manual retry and settles a replacement deadline without an automatic loop", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);
    const first = deferred<LiveKitRoomToken>();
    const second = deferred<LiveKitRoomToken>();
    const third = deferred<LiveKitRoomToken>();
    const fetchFreshRoomToken = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const view = renderRecovery(fetchFreshRoomToken, roomSession(nowMs - 1));

    act(() => view.result.current.recovery.onLifecycleChange("reconnecting"));
    act(() => view.result.current.recovery.retry());
    await act(async () => first.resolve({ ...freshToken(nowMs + 15 * 60_000), token: "stale-token" }));
    expect(view.result.current.session?.token).toBe("old-token");
    await act(async () => second.resolve(freshToken(nowMs + 15 * 60_000)));
    expect(view.result.current.session?.token).toBe("fresh-token");

    act(() => vi.advanceTimersByTime(classroomMediaReplacementDeadlineMs));
    expect(view.result.current.recovery.phase).toBe("failed");
    act(() => vi.advanceTimersByTime(classroomMediaReplacementDeadlineMs * 10));
    expect(fetchFreshRoomToken).toHaveBeenCalledTimes(2);

    act(() => view.result.current.recovery.retry());
    expect(fetchFreshRoomToken).toHaveBeenCalledTimes(3);
    await act(async () => third.reject(new Error("opaque failure")));
    expect(view.result.current.recovery.phase).toBe("failed");
  });

  it("ignores a deferred completion after unmount", async () => {
    const pending = deferred<LiveKitRoomToken>();
    const fetchFreshRoomToken = vi.fn(() => pending.promise);
    const view = renderRecovery(fetchFreshRoomToken, roomSession(nowMs - 1));

    act(() => view.result.current.recovery.onLifecycleChange("reconnecting"));
    view.unmount();
    await act(async () => pending.resolve(freshToken(nowMs + 15 * 60_000)));

    expect(fetchFreshRoomToken).toHaveBeenCalledTimes(1);
  });
});

function renderRecovery(
  fetchFreshRoomToken: (lessonId: string) => Promise<LiveKitRoomToken>,
  initialSession: LessonRoomSession,
) {
  return renderHook(() => {
    const [session, setSession] = useState<LessonRoomSession | null>(initialSession);
    const recovery = useClassroomMediaRecovery({
      fetchFreshRoomToken,
      now: () => Date.now(),
      roomSession: session,
      setRoomSession: setSession,
    });
    return { recovery, session, setSession };
  });
}

function roomSession(mediaExpiresAtMs: number): LessonRoomSession {
  return {
    courseTitle: "Course",
    expiresAt: new Date(nowMs + 15 * 60_000).toISOString(),
    identity: "participant",
    lessonEndsAt: null,
    lessonId: "lesson-1",
    lessonStartsAt: null,
    lessonStatus: "IN_PROGRESS",
    lessonTemplateId: null,
    lessonTitle: "Lesson",
    lessonTranslationAllowed: false,
    lessonType: "INDIVIDUAL",
    lessonUpdatedAt: new Date(nowMs).toISOString(),
    materialId: "material-1",
    mediaChoices: {
      audioDeviceId: "microphone",
      audioEnabled: true,
      audioOutputDeviceId: "speaker",
      videoDeviceId: "camera",
      videoEnabled: true,
    },
    mediaRouting: {
      expiresAt: new Date(mediaExpiresAtMs).toISOString(),
      iceServers: [{ credential: "test-only", urls: ["turn:test.invalid"], username: "test-only" }],
      iceTransportPolicy: "relay",
      policy: "REGIONAL_RELAY",
      revision: "selectel-rf-v1",
    },
    participants: [],
    participantPresence: { participant: "ONLINE" },
    roomName: "lesson-room",
    serverUrl: "wss://livekit.test.invalid",
    teacherName: "Teacher",
    teacherSubject: "teacher",
    token: "old-token",
    workMode: "SHARED",
  };
}

function freshToken(mediaExpiresAtMs: number): LiveKitRoomToken {
  return {
    expiresAt: new Date(nowMs + 30 * 60_000).toISOString(),
    identity: "participant",
    lessonTranslationAllowed: false,
    mediaRouting: {
      expiresAt: new Date(mediaExpiresAtMs).toISOString(),
      iceServers: [{ credential: "fresh-test-only", urls: ["turn:test.invalid"], username: "fresh-test-only" }],
      iceTransportPolicy: "relay",
      policy: "REGIONAL_RELAY",
      revision: "selectel-rf-v1",
    },
    roomName: "lesson-room",
    serverUrl: "wss://livekit.test.invalid",
    token: "fresh-token",
  };
}

function sessionKey(session: LessonRoomSession): string {
  return liveKitRoomInstanceKey(session.roomName, session.expiresAt, session.serverUrl, session.mediaRouting);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
