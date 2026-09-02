// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createCollaborationDocumentToken,
  type CollaborationDocument,
  type CollaborationDocumentToken,
} from "../../../shared/api/playsay";
import { isInvalidCollaborationDocumentError, useYjsWorkspace } from "./useYjsWorkspace";

const apiMocks = vi.hoisted(() => ({ createToken: vi.fn() }));

vi.mock("../../../shared/api/playsay", () => {
  class MockApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    ApiError: MockApiError,
    createCollaborationDocumentToken: apiMocks.createToken,
    isApiStatus: (caught: unknown, status: number) => (
      caught instanceof MockApiError && caught.status === status
    ),
  };
});

vi.mock("./yjsRuntime", () => ({
  createYjsWorkspaceRuntime: () => ({
    destroy: vi.fn(),
    getClientId: () => 42,
    handleSocketMessage: vi.fn(),
    setSocket: vi.fn(),
    startSocketSync: vi.fn(),
  }),
}));

vi.mock("../model/gameRealtimeClient", () => ({
  createGameRealtimeClient: () => ({ close: vi.fn() }),
}));

vi.mock("../model/gameSyncSessionController", () => ({
  createGameSyncSessionController: () => ({
    close: vi.fn(),
    receiveFallback: vi.fn(),
    replaceCheckpoints: vi.fn(),
  }),
}));

class FakeWebSocket {
  static readonly CLOSED = 3;
  static readonly CLOSING = 2;
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  binaryType = "blob";
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  readyState = FakeWebSocket.CONNECTING;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close", { code: 1000 }));
  }

  emitClose(code = 1006): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close", { code }));
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }
}

const collaborationDocument = {
  createdAt: "2026-09-02T00:00:00Z",
  documentKind: "LESSON_MATERIAL",
  id: "document-1",
  lessonId: "lesson-1",
  materialId: "material-1",
  scope: "GROUP",
  updatedAt: "2026-09-02T00:00:00Z",
  version: 1,
  yjsDocumentId: "yjs-1",
} satisfies CollaborationDocument;

function token(websocketUrl: string): CollaborationDocumentToken {
  return {
    documentId: collaborationDocument.id,
    expiresAt: "2026-09-02T01:00:00Z",
    token: "test-token",
    websocketUrl,
    yjsDocumentId: collaborationDocument.yjsDocumentId,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.mocked(createCollaborationDocumentToken).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("isInvalidCollaborationDocumentError", () => {
  it("treats missing and retired documents as terminal for the current socket", () => {
    expect(isInvalidCollaborationDocumentError(new ApiError(404, "NOT_FOUND", "missing"))).toBe(true);
    expect(isInvalidCollaborationDocumentError(new ApiError(410, "GONE", "retired"))).toBe(true);
  });

  it("keeps transient failures on the reconnect path", () => {
    expect(isInvalidCollaborationDocumentError(new ApiError(503, "UNAVAILABLE", "retry"))).toBe(false);
    expect(isInvalidCollaborationDocumentError(new Error("network"))).toBe(false);
  });
});

describe("useYjsWorkspace socket replacement", () => {
  it("deduplicates connecting triggers and replaces a route with a fresh token", async () => {
    let resolveFirst!: (value: CollaborationDocumentToken) => void;
    vi.mocked(createCollaborationDocumentToken)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(token("wss://online.honeyschool.ru/collab/ws"));

    const { result, unmount } = renderHook(() => useYjsWorkspace({
      color: "#ff0",
      document: collaborationDocument,
      participantName: "Participant",
    }));
    await act(async () => Promise.resolve());
    act(() => {
      window.dispatchEvent(new Event("online"));
      globalThis.document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(createCollaborationDocumentToken).toHaveBeenCalledTimes(1);

    await act(async () => resolveFirst(token("wss://online.honey.school/collab/ws")));
    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => FakeWebSocket.instances[0].open());
    expect(result.current.status).toBe("connected");

    act(() => FakeWebSocket.instances[0].emitClose());
    expect(result.current.reconnectCount).toBe(1);
    await act(async () => { vi.advanceTimersByTime(1_000); await Promise.resolve(); });
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(new URL(FakeWebSocket.instances[1].url).host).toBe("online.honeyschool.ru");
    unmount();
  });

  it("ignores late close events from a superseded socket across repeated recovery", async () => {
    vi.mocked(createCollaborationDocumentToken)
      .mockResolvedValueOnce(token("wss://online.honey.school/collab/ws"))
      .mockResolvedValue(token("wss://online.honeyschool.ru/collab/ws"));
    const { result, unmount } = renderHook(() => useYjsWorkspace({
      color: "#ff0",
      document: collaborationDocument,
      participantName: "Participant",
    }));
    await act(async () => Promise.resolve());
    expect(FakeWebSocket.instances).toHaveLength(1);
    const first = FakeWebSocket.instances[0];
    act(() => first.emitClose());
    await act(async () => { vi.advanceTimersByTime(1_000); await Promise.resolve(); });
    expect(FakeWebSocket.instances).toHaveLength(2);
    const second = FakeWebSocket.instances[1];
    act(() => second.open());
    const reconnectsAfterReplacement = result.current.reconnectCount;

    act(() => first.emitClose());
    expect(result.current.reconnectCount).toBe(reconnectsAfterReplacement);
    expect(createCollaborationDocumentToken).toHaveBeenCalledTimes(2);

    act(() => second.emitClose());
    await act(async () => { vi.advanceTimersByTime(1_000); await Promise.resolve(); });
    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(createCollaborationDocumentToken).toHaveBeenCalledTimes(3);
    unmount();
  });
});
