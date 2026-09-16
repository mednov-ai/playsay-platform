import { describe, expect, it, vi } from "vitest";
import { createInputDispatcher, type DispatchSession } from "./input-dispatch";
import type { PageCommand } from "./protocol";

const command = {
  version: 1,
  type: "INPUT",
  sessionId: "session-1",
  nonce: "nonce-1",
  eventId: "event-1",
  input: { type: "pointer", action: "down", x: 400, y: 300, normalizedX: 0.5, normalizedY: 0.5 },
} satisfies PageCommand;

function session(): DispatchSession {
  return {
    inputEnabled: true,
    targetTabId: 7,
    viewport: { height: 600, width: 800, refreshedAt: 1_000, revision: 1 },
  };
}

describe("trusted input dispatch", () => {
  it("dispatches against the current viewport and deduplicates the same event id", async () => {
    const sendCommand = vi.fn(async (_targetTabId: number, _method: string, _params: Record<string, unknown>) => undefined);
    const dispatch = createInputDispatcher({
      now: () => 2_000,
      refreshViewport: vi.fn(async () => undefined),
      sendCommand,
      targetAvailable: async () => true,
    });
    const current = session();
    expect(await dispatch(command, current)).toMatchObject({ result: "DISPATCHED", viewportRevision: 1 });
    expect(await dispatch(command, current)).toMatchObject({ result: "DISPATCHED", viewportRevision: 1 });
    expect(sendCommand).toHaveBeenCalledTimes(1);
    expect(sendCommand.mock.calls[0]?.[2]).toMatchObject({ x: 400, y: 300 });
  });

  it("refreshes a stale viewport before mapping normalized coordinates", async () => {
    const current = session();
    const sendCommand = vi.fn(async (_targetTabId: number, _method: string, _params: Record<string, unknown>) => undefined);
    const dispatch = createInputDispatcher({
      now: () => 5_000,
      refreshViewport: async (candidate) => {
        candidate.viewport = { height: 900, width: 1200, refreshedAt: 5_000, revision: 2 };
      },
      sendCommand,
      targetAvailable: async () => true,
    });
    expect(await dispatch(command, current)).toMatchObject({ result: "DISPATCHED", viewportRevision: 2 });
    expect(sendCommand.mock.calls[0]?.[2]).toMatchObject({ x: 600, y: 450 });
  });

  it.each([
    [null, "STALE_SESSION"],
    [{ ...session(), inputEnabled: false }, "INPUT_DISABLED"],
  ] as const)("returns a stable result for unavailable session state", async (current, result) => {
    const dispatch = createInputDispatcher({
      refreshViewport: vi.fn(async () => undefined),
      sendCommand: vi.fn(async () => undefined),
      targetAvailable: async () => true,
    });
    expect(await dispatch(command, current)).toMatchObject({ result });
  });

  it("distinguishes missing target, stale viewport and debugger failure", async () => {
    const missing = createInputDispatcher({
      refreshViewport: vi.fn(async () => undefined),
      sendCommand: vi.fn(async () => undefined),
      targetAvailable: async () => false,
    });
    expect(await missing(command, session())).toMatchObject({ result: "TARGET_UNAVAILABLE" });

    const stale = createInputDispatcher({
      now: () => 5_000,
      refreshViewport: async () => { throw new Error("private viewport detail"); },
      sendCommand: vi.fn(async () => undefined),
      targetAvailable: async () => true,
    });
    expect(await stale(command, session())).toMatchObject({ result: "VIEWPORT_STALE" });

    const failed = createInputDispatcher({
      now: () => 1_000,
      refreshViewport: vi.fn(async () => undefined),
      sendCommand: async () => { throw new Error("private debugger detail"); },
      targetAvailable: async () => true,
    });
    expect(await failed(command, session())).toMatchObject({ result: "DEBUGGER_FAILED" });
  });
});
