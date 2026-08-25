// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { RoomEvent } from "livekit-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExternalActivitySession } from "./useExternalActivitySession";

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

  it("uses the 0.1.7 acknowledgement to distinguish extension readiness from detection timeout", async () => {
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
    act(() => dispatchExtensionEvent({ version: 1, type: "AWAITING_ACTION", sessionId, extensionVersion: "0.1.7" }));
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

  it("clears a student session when a previously received host track disappears", async () => {
    vi.useFakeTimers();
    const publication = {
      track: { mediaStreamTrack: {} as MediaStreamTrack },
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

    teacher.trackPublications.clear();
    act(() => emit(RoomEvent.TrackUnsubscribed));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(result.current.active).toBeNull();
    expect(result.current.mediaStream).toBeNull();
    unmount();
  });
});
