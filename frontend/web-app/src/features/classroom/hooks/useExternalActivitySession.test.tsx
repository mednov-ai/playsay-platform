// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { RoomEvent } from "livekit-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExternalActivitySession } from "./useExternalActivitySession";
import type { ExternalActivityRealtimeMessage } from "../model/externalActivityProtocol";

type RoomHandler = (...args: unknown[]) => void;
const handlers = new Map<string, Set<RoomHandler>>();
const publishData = vi.fn<(
  payload: Uint8Array,
  options: { reliable: boolean; topic: string },
) => Promise<void>>(async () => undefined);
const room = {
  localParticipant: {
    identity: "teacher",
    publishData,
    publishTrack: vi.fn(async () => undefined),
    unpublishTrack: vi.fn(async () => undefined),
  },
  off: vi.fn((event: string, handler: RoomHandler) => handlers.get(event)?.delete(handler)),
  on: vi.fn((event: string, handler: RoomHandler) => {
    const eventHandlers = handlers.get(event) ?? new Set<RoomHandler>();
    eventHandlers.add(handler);
    handlers.set(event, eventHandlers);
  }),
  remoteParticipants: new Map<string, unknown>(),
};

vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => room,
}));

function emit(event: RoomEvent, ...args: unknown[]) {
  handlers.get(event)?.forEach((handler) => handler(...args));
}

function decodedMessages() {
  return publishData.mock.calls.map(([payload]) => (
    JSON.parse(new TextDecoder().decode(payload as Uint8Array)) as { type: string; [key: string]: unknown }
  ));
}

function dispatchExtensionEvent(event: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent("message", {
    data: { channel: "playsay.external-activity.extension.v1", event },
    origin: window.location.origin,
    source: window,
  }));
}

const block = {
  id: "external-1",
  type: "externalActivity" as const,
  title: "Wordwall",
  url: "https://wordwall.net/resource/1",
};

describe("useExternalActivitySession", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    handlers.clear();
    publishData.mockClear();
    room.localParticipant.publishTrack.mockClear();
    room.localParticipant.unpublishTrack.mockClear();
    room.remoteParticipants.clear();
    vi.stubGlobal("MediaStream", class {
      constructor(public tracks: MediaStreamTrack[] = []) {}
      getTracks() { return this.tracks; }
    });
  });

  it("turns a disabled build into a visible unavailable state instead of a silent launch", () => {
    const postMessage = vi.spyOn(window, "postMessage");
    const { result } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: false,
      isHost: true,
      participantColor: "#ff5c00",
      participantName: "Teacher",
    }));

    act(() => result.current.open(block));

    expect(result.current.active).toMatchObject({
      blockId: block.id,
      errorCode: "FEATURE_UNAVAILABLE",
      phase: "ERROR",
    });
    expect(postMessage).not.toHaveBeenCalled();
    postMessage.mockRestore();
  });

  it("uses the 0.1.8 acknowledgement to distinguish extension readiness from detection timeout", async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: true,
      participantColor: "#ff5c00",
      participantName: "Teacher",
    }));

    act(() => result.current.open(block));
    expect(result.current.active?.phase).toBe("OPENING_PROVIDER");
    const sessionId = result.current.active!.sessionId;
    act(() => dispatchExtensionEvent({ version: 1, type: "AWAITING_ACTION", sessionId, extensionVersion: "0.1.8" }));
    expect(result.current.active?.phase).toBe("AWAITING_ACTION");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.active?.phase).toBe("AWAITING_ACTION");
    unmount();
  });

  it("stops before capture with an actionable error for the old 0.1.6 extension", () => {
    const { result } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: true,
      participantColor: "#ff5c00",
      participantName: "Teacher",
    }));

    act(() => result.current.open(block));
    const sessionId = result.current.active!.sessionId;
    act(() => dispatchExtensionEvent({ version: 1, type: "AWAITING_ACTION", sessionId }));

    expect(result.current.active).toMatchObject({
      errorCode: "EXTENSION_UPDATE_REQUIRED",
      phase: "ERROR",
    });
  });

  it("reports a bounded error when the extension does not acknowledge the request", async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: true,
      participantColor: "#ff5c00",
      participantName: "Teacher",
    }));

    act(() => result.current.open(block));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(result.current.active).toMatchObject({
      errorCode: "EXTENSION_NOT_DETECTED",
      phase: "ERROR",
    });
    unmount();
  });

  it("sends teacher input only through the local extension bridge", async () => {
    const videoTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [],
      getTracks: () => [videoTrack],
      getVideoTracks: () => [videoTrack],
    } as unknown as MediaStream;
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => stream) },
    });
    const postMessage = vi.spyOn(window, "postMessage");
    const { result } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: true,
      participantColor: "#ff5c00",
      participantName: "Teacher",
    }));

    act(() => result.current.open(block));
    const sessionId = result.current.active!.sessionId;
    act(() => dispatchExtensionEvent({
      version: 1,
      type: "AWAITING_ACTION",
      sessionId,
      extensionVersion: "0.1.8",
    }));
    act(() => dispatchExtensionEvent({
      version: 1,
      type: "CAPTURE_READY",
      sessionId,
      streamId: "stream-1",
    }));
    await waitFor(() => expect(result.current.active?.phase).toBe("ACTIVE"));
    postMessage.mockClear();
    publishData.mockClear();

    act(() => result.current.sendInput({ type: "pointer", action: "down", x: 10, y: 20 }));

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: "playsay.external-activity.page.v1",
      command: expect.objectContaining({ type: "INPUT", sessionId, eventId: expect.any(String) }),
    }), window.location.origin);
    expect(publishData).not.toHaveBeenCalled();

    postMessage.mockClear();
    const participantInput = {
      version: 1,
      type: "INPUT",
      sessionId,
      blockId: block.id,
      eventId: "participant-event-1",
      input: { type: "key", action: "down", key: "b" },
    };
    const student = { identity: "student", metadata: JSON.stringify({ playsayRole: "STUDENT" }), name: "Student" };
    act(() => {
      const payload = new TextEncoder().encode(JSON.stringify(participantInput));
      emit(RoomEvent.DataReceived, payload, student, undefined, "playsay.external-activity.input.v1");
      emit(RoomEvent.DataReceived, payload, student, undefined, "playsay.external-activity.input.v1");
    });
    expect(postMessage.mock.calls.filter(([message]) => (
      (message as { command?: { eventId?: string } }).command?.eventId === "participant-event-1"
    ))).toHaveLength(1);
    postMessage.mockRestore();
  });

  it("falls back to LiveKit data for participant input when no realtime client is wired", async () => {
    const teacher = {
      identity: "teacher",
      metadata: JSON.stringify({ playsayRole: "TEACHER" }),
      name: "Teacher",
      trackPublications: new Map(),
    };
    const { result } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: false,
      participantColor: "#ff5c00",
      participantName: "Student",
      trustedHostIdentity: "teacher",
    }));
    act(() => emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify({
      version: 1,
      type: "HOST_STATE",
      sessionId: "session-1",
      blockId: block.id,
      phase: "ACTIVE",
      studentsLocked: false,
      visible: true,
    })), teacher, undefined, "playsay.external-activity.host.v1"));
    publishData.mockClear();

    act(() => result.current.sendInput({ type: "key", action: "down", key: "a" }));
    await waitFor(() => expect(publishData).toHaveBeenCalledTimes(1));

    expect(publishData.mock.calls[0]?.[1]).toEqual({
      reliable: true,
      topic: "playsay.external-activity.input.v1",
    });
    expect(decodedMessages()[0]).toMatchObject({
      blockId: block.id,
      type: "INPUT",
      sessionId: "session-1",
    });
  });

  it("reuses the same event id when uncertain fast-lane delivery falls back to LiveKit", async () => {
    vi.useFakeTimers();
    let realtimeSubscriber: ((message: ExternalActivityRealtimeMessage) => void) | undefined;
    const realtime = {
      acquire: vi.fn((subscriber) => {
        realtimeSubscriber = subscriber;
        return () => undefined;
      }),
      close: vi.fn(),
      publish: vi.fn((_message: ExternalActivityRealtimeMessage) => true),
    };
    const teacher = {
      identity: "teacher",
      metadata: JSON.stringify({ playsayRole: "TEACHER" }),
      name: "Teacher",
      trackPublications: new Map(),
    };
    const { result, unmount } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: false,
      participantColor: "#ff5c00",
      participantName: "Student",
      realtime,
      trustedHostIdentity: "teacher",
    }));
    act(() => emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify({
      version: 1,
      type: "HOST_STATE",
      sessionId: "session-1",
      blockId: block.id,
      phase: "ACTIVE",
      studentsLocked: false,
      visible: true,
    })), teacher, undefined, "playsay.external-activity.host.v1"));
    publishData.mockClear();

    act(() => result.current.sendInput({ type: "key", action: "down", key: "a" }));
    const fastMessage = realtime.publish.mock.calls[0]?.[0];
    expect(fastMessage).toMatchObject({ kind: "external-input", sessionId: "session-1" });
    if (fastMessage?.kind !== "external-input") throw new Error("expected external input");
    expect(publishData).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(decodedMessages().at(-1)).toMatchObject({
      type: "INPUT",
      eventId: fastMessage?.eventId,
      sessionId: "session-1",
    });

    act(() => realtimeSubscriber?.({
      blockId: block.id,
      eventId: fastMessage!.eventId,
      kind: "external-result",
      result: "DISPATCHED",
      sessionId: "session-1",
    }));
    expect(result.current.inputStatus).toBeNull();
    unmount();
  });

  it("reports acknowledgement timeout after fallback without claiming provider success", async () => {
    vi.useFakeTimers();
    const realtime = {
      acquire: (_subscriber: (message: ExternalActivityRealtimeMessage) => void) => () => undefined,
      close: vi.fn(),
      publish: vi.fn((_message: ExternalActivityRealtimeMessage) => true),
    };
    const teacher = {
      identity: "teacher",
      metadata: JSON.stringify({ playsayRole: "TEACHER" }),
      name: "Teacher",
      trackPublications: new Map(),
    };
    const { result, unmount } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: false,
      participantColor: "#ff5c00",
      participantName: "Student",
      realtime,
      trustedHostIdentity: "teacher",
    }));
    act(() => emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify({
      version: 1,
      type: "HOST_STATE",
      sessionId: "session-1",
      blockId: block.id,
      phase: "ACTIVE",
      studentsLocked: false,
      visible: true,
    })), teacher, undefined, "playsay.external-activity.host.v1"));

    act(() => result.current.sendInput({ type: "key", action: "down", key: "a" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });

    expect(result.current.inputStatus).toMatchObject({ code: "ACK_TIMEOUT", transport: "livekit" });
    unmount();
  });

  it("keeps raw extension failures out of participant host state", () => {
    const { result } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: true,
      participantColor: "#ff5c00",
      participantName: "Teacher",
    }));

    act(() => result.current.open(block));
    const sessionId = result.current.active!.sessionId;
    act(() => dispatchExtensionEvent({
      version: 1,
      type: "ERROR",
      sessionId,
      error: "NotAllowedError: private browser detail",
    }));

    expect(result.current.active?.errorCode).toBe("CAPTURE_PERMISSION_DENIED");
    const hostState = decodedMessages().filter(({ type }) => type === "HOST_STATE").at(-1);
    expect(hostState).toMatchObject({ phase: "ERROR" });
    expect(hostState).not.toHaveProperty("errorCode");
    expect(JSON.stringify(hostState)).not.toContain("private browser detail");
  });

  it("retries with a clean session and ignores late events from the stale attempt", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    const { result } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: true,
      participantColor: "#ff5c00",
      participantName: "Teacher",
    }));

    act(() => result.current.open(block));
    const firstSessionId = result.current.active!.sessionId;
    act(() => result.current.retry());
    await waitFor(() => {
      expect(result.current.active).toMatchObject({ phase: "OPENING_PROVIDER" });
      expect(result.current.active?.sessionId).not.toBe(firstSessionId);
    });
    const secondSessionId = result.current.active!.sessionId;

    act(() => dispatchExtensionEvent({
      version: 1,
      type: "CAPTURE_READY",
      sessionId: firstSessionId,
      streamId: "stale-stream",
    }));

    expect(result.current.active).toMatchObject({ phase: "OPENING_PROVIDER", sessionId: secondSessionId });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("moves from capture readiness to active sharing", async () => {
    const videoTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [],
      getTracks: () => [videoTrack],
      getVideoTracks: () => [videoTrack],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    const { result } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: true,
      participantColor: "#ff5c00",
      participantName: "Teacher",
    }));

    act(() => result.current.open(block));
    const sessionId = result.current.active!.sessionId;
    act(() => dispatchExtensionEvent({ version: 1, type: "CAPTURE_READY", sessionId, streamId: "stream-1" }));

    await waitFor(() => expect(result.current.active?.phase).toBe("ACTIVE"));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(videoTrack, expect.objectContaining({
      name: expect.stringContaining(sessionId),
    }));
  });

  it("publishes STOPPED before the final HOST_IDLE state", async () => {
    const { result } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: true,
      participantColor: "#ff5c00",
      participantName: "Teacher",
    }));

    act(() => result.current.open(block));
    await waitFor(() => expect(result.current.active?.phase).toBe("OPENING_PROVIDER"));
    act(() => result.current.returnToLesson());
    await waitFor(() => expect(decodedMessages().some(({ type }) => type === "HOST_IDLE")).toBe(true));

    const stopIndex = decodedMessages().findIndex(({ type }) => type === "STOPPED");
    const idleIndex = decodedMessages().findIndex(({ type }, index) => type === "HOST_IDLE" && index > stopIndex);
    expect(stopIndex).toBeGreaterThanOrEqual(0);
    expect(idleIndex).toBeGreaterThan(stopIndex);
    expect(result.current.active).toBeNull();
  });

  it("waits for STOPPED delivery before publishing HOST_IDLE", async () => {
    let releaseStopped!: () => void;
    const stoppedDelivery = new Promise<void>((resolve) => { releaseStopped = resolve; });
    const { result } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: true,
      participantColor: "#ff5c00",
      participantName: "Teacher",
    }));

    act(() => result.current.open(block));
    await waitFor(() => expect(result.current.active?.phase).toBe("OPENING_PROVIDER"));
    publishData.mockClear();
    publishData.mockImplementationOnce(() => stoppedDelivery).mockResolvedValue(undefined);

    act(() => result.current.returnToLesson());
    await waitFor(() => expect(decodedMessages().some(({ type }) => type === "STOPPED")).toBe(true));
    expect(decodedMessages().some(({ type }) => type === "HOST_IDLE")).toBe(false);

    releaseStopped();
    await waitFor(() => expect(decodedMessages().some(({ type }) => type === "HOST_IDLE")).toBe(true));
  });

  it("ignores a stale HOST_IDLE after a replacement session starts", () => {
    const teacher = {
      identity: "teacher",
      metadata: JSON.stringify({ playsayRole: "TEACHER" }),
      name: "Teacher",
      trackPublications: new Map(),
    };
    const { result } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: false,
      participantColor: "#ff5c00",
      participantName: "Student",
      trustedHostIdentity: "teacher",
    }));
    const hostMessage = (type: "HOST_STATE" | "HOST_IDLE", sessionId: string) => {
      act(() => emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify({
        version: 1,
        type,
        sessionId,
        blockId: block.id,
        ...(type === "HOST_STATE" ? { phase: "ACTIVE", studentsLocked: false, visible: true } : {}),
      })), teacher, undefined, "playsay.external-activity.host.v1"));
    };

    hostMessage("HOST_STATE", "session-old");
    hostMessage("HOST_STATE", "session-new");
    hostMessage("HOST_IDLE", "session-old");
    expect(result.current.active?.sessionId).toBe("session-new");

    hostMessage("HOST_IDLE", "session-new");
    expect(result.current.active).toBeNull();
  });

  it.each(["STOPPED", "HOST_IDLE"] as const)("clears a student-first request on trusted host %s for a different session", (type) => {
    const teacher = {
      identity: "teacher",
      metadata: JSON.stringify({ playsayRole: "TEACHER" }),
      name: "Teacher",
      trackPublications: new Map(),
    };
    const { result } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: false,
      participantColor: "#ff5c00",
      participantName: "Student",
      trustedHostIdentity: "teacher",
    }));

    act(() => result.current.open(block));
    expect(result.current.active).toMatchObject({ hostIdentity: null, phase: "REQUESTED" });

    act(() => emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify({
      version: 1,
      type,
      sessionId: "host-session",
      blockId: block.id,
    })), teacher, undefined, "playsay.external-activity.host.v1"));

    expect(result.current.active).toBeNull();
  });

  it("converges a student-first request from the trusted host video track when host state is missed", async () => {
    const studentSessionId = "00000000-0000-4000-8000-000000000001";
    const mediaTrack = {} as MediaStreamTrack;
    const publication = {
      setSubscribed: vi.fn(),
      track: { mediaStreamTrack: mediaTrack },
      trackName: `playsay-external-activity-${studentSessionId}-video`,
    };
    const teacher = {
      identity: "teacher",
      metadata: JSON.stringify({ playsayRole: "TEACHER" }),
      name: "Teacher",
      trackPublications: new Map([["video", publication]]),
    };
    room.remoteParticipants.set("teacher", teacher);
    const { result } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: false,
      participantColor: "#ff5c00",
      participantName: "Student",
      trustedHostIdentity: "teacher",
    }));

    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(studentSessionId);
    act(() => result.current.open(block));
    expect(result.current.active).toMatchObject({ phase: "REQUESTED", sessionId: studentSessionId });

    act(() => emit(RoomEvent.TrackSubscribed, publication.track, publication, teacher));
    await waitFor(() => expect(result.current.active).toMatchObject({
      hostIdentity: "teacher",
      phase: "ACTIVE",
      sessionId: studentSessionId,
    }));
    expect(result.current.mediaStream).not.toBeNull();
  });

  it("explicitly subscribes to a trusted published activity video track", () => {
    const publication = {
      setSubscribed: vi.fn(),
      track: undefined,
      trackName: "playsay-external-activity-session-1-video",
    };
    const teacher = {
      identity: "teacher",
      metadata: JSON.stringify({ playsayRole: "TEACHER" }),
      name: "Teacher",
      trackPublications: new Map([["video", publication]]),
    };
    room.remoteParticipants.set("teacher", teacher);
    renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: false,
      participantColor: "#ff5c00",
      participantName: "Student",
      trustedHostIdentity: "teacher",
    }));

    act(() => emit(RoomEvent.TrackPublished, publication, teacher));

    expect(publication.setSubscribed).toHaveBeenCalledWith(true);
  });

  it("clears a student session when an unsubscribed host track remains stale in the publication map", async () => {
    vi.useFakeTimers();
    const mediaTrack = {} as MediaStreamTrack;
    const remoteTrack = { mediaStreamTrack: mediaTrack };
    const publication = {
      track: remoteTrack,
      trackName: "playsay-external-activity-session-1-video",
    };
    const teacher = {
      identity: "teacher",
      metadata: JSON.stringify({ playsayRole: "TEACHER" }),
      name: "Teacher",
      trackPublications: new Map([["video", publication]]),
    };
    room.remoteParticipants.set("teacher", teacher);
    const { result, unmount } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: false,
      participantColor: "#ff5c00",
      participantName: "Student",
      trustedHostIdentity: "teacher",
    }));

    act(() => emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify({
      version: 1,
      type: "HOST_STATE",
      sessionId: "session-1",
      blockId: block.id,
      phase: "ACTIVE",
      studentsLocked: false,
      visible: true,
    })), teacher, undefined, "playsay.external-activity.host.v1"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.active?.sessionId).toBe("session-1");

    act(() => emit(RoomEvent.TrackUnsubscribed, remoteTrack));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(result.current.active).toBeNull();
    expect(result.current.mediaStream).toBeNull();
    unmount();
  });

  it("clears a student session when an unpublished host track remains stale in the publication map", async () => {
    vi.useFakeTimers();
    const mediaTrack = {} as MediaStreamTrack;
    const publication = {
      track: { mediaStreamTrack: mediaTrack },
      trackName: "playsay-external-activity-session-1-video",
    };
    const teacher = {
      identity: "teacher",
      metadata: JSON.stringify({ playsayRole: "TEACHER" }),
      name: "Teacher",
      trackPublications: new Map([["video", publication]]),
    };
    room.remoteParticipants.set("teacher", teacher);
    const { result, unmount } = renderHook(() => useExternalActivitySession({
      blocks: [block],
      enabled: true,
      isHost: false,
      participantColor: "#ff5c00",
      participantName: "Student",
      trustedHostIdentity: "teacher",
    }));

    act(() => emit(RoomEvent.DataReceived, new TextEncoder().encode(JSON.stringify({
      version: 1,
      type: "HOST_STATE",
      sessionId: "session-1",
      blockId: block.id,
      phase: "ACTIVE",
      studentsLocked: false,
      visible: true,
    })), teacher, undefined, "playsay.external-activity.host.v1"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.active?.sessionId).toBe("session-1");

    act(() => emit(RoomEvent.TrackUnpublished, publication));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });

    expect(result.current.active).toBeNull();
    expect(result.current.mediaStream).toBeNull();
    unmount();
  });
});
