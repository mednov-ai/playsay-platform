import { describe, expect, it, vi } from "vitest";
import type {
  MaterialHtmlGameRealtime,
  MaterialHtmlGameRealtimeMessage,
  MaterialHtmlGameSdkOrderedAction,
} from "../../materials/model/materialDocument";
import { createGameSyncSessionController } from "./gameSyncSessionController";

function orderedAction(revision: number, blockId = "game", runId = "run"): MaterialHtmlGameSdkOrderedAction {
  return {
    actorId: "student",
    actorSequence: revision,
    at: revision,
    authorityRevision: revision,
    blockId,
    eventId: `event-${blockId}-${revision}`,
    gameId: "racing",
    id: `event-${blockId}-${revision}`,
    logicalTime: revision,
    payload: { delta: 1 },
    runId,
    stateVersion: "1",
    type: "move",
  };
}

function fixture() {
  const registrations = new Map<string, (message: MaterialHtmlGameRealtimeMessage) => void>();
  const publish = vi.fn();
  const acknowledge = vi.fn();
  const realtime: MaterialHtmlGameRealtime = {
    acknowledge,
    acquire: vi.fn((registration) => {
      registrations.set(`${registration.blockId}/${registration.runId}`, registration.onMessage);
      return () => registrations.delete(`${registration.blockId}/${registration.runId}`);
    }),
    publish,
  };
  const controller = createGameSyncSessionController({
    publishCheckpoint: vi.fn(),
    realtime,
  });
  return { acknowledge, controller, publish, realtime, registrations };
}

function port() {
  return { postMessage: vi.fn() } as unknown as MessagePort;
}

describe("game sync session controller", () => {
  it("dispatches 100 ordered actions without recreating the transport registration", () => {
    const { controller, realtime, registrations } = fixture();
    const targetPort = port();
    controller.attach({
      actorId: "student",
      blockId: "game",
      getCheckpoint: () => undefined,
      getPort: () => targetPort,
      isAuthority: false,
      onFailure: vi.fn(),
      runId: "run",
      validateRequest: () => true,
    });
    const receive = registrations.get("game/run");
    for (let revision = 1; revision <= 100; revision += 1) {
      receive?.({ action: orderedAction(revision), kind: "ordered-action" });
    }
    expect(realtime.acquire).toHaveBeenCalledOnce();
    expect(targetPort.postMessage).toHaveBeenCalledTimes(100);
  });

  it("applies shadow fast/fallback duplicates once and acknowledges optimistic state", () => {
    const { acknowledge, controller, registrations } = fixture();
    const targetPort = port();
    controller.attach({
      actorId: "student",
      blockId: "game",
      getCheckpoint: () => undefined,
      getPort: () => targetPort,
      isAuthority: false,
      onFailure: vi.fn(),
      runId: "run",
      validateRequest: () => true,
    });
    const message = { action: orderedAction(1), kind: "ordered-action" } as const;
    registrations.get("game/run")?.(message);
    controller.receiveFallback(message);
    expect(targetPort.postMessage).toHaveBeenCalledOnce();
    expect(acknowledge).toHaveBeenCalledWith(message.action.eventId);
  });

  it("orders a replica request once on authority and ignores the duplicate fallback", () => {
    const { controller, publish, registrations } = fixture();
    const targetPort = port();
    controller.attach({
      actorId: "teacher",
      blockId: "game",
      getCheckpoint: () => undefined,
      getPort: () => targetPort,
      isAuthority: true,
      onFailure: vi.fn(),
      runId: "run",
      validateRequest: () => true,
    });
    const request = {
      ...orderedAction(1),
      id: "request-1",
    };
    const { authorityRevision: _authorityRevision, logicalTime: _logicalTime, ...unordered } = request;
    const message = { kind: "action-request", request: unordered } as const;
    registrations.get("game/run")?.(message);
    controller.receiveFallback(message);
    expect(targetPort.postMessage).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ authorityRevision: 1, logicalTime: 1 }),
      kind: "ordered-action",
    }));
  });

  it("requests resume on a revision gap and recovers from the durable checkpoint", () => {
    const { controller, publish, registrations } = fixture();
    const targetPort = port();
    const checkpoint = {
      checksum: "checksum",
      gameId: "racing",
      logicalTime: 4,
      revision: 4,
      runId: "run",
      seed: 1,
      state: { position: 4 },
      stateVersion: "1",
      updatedAt: 1,
    };
    controller.attach({
      actorId: "student",
      blockId: "game",
      getCheckpoint: () => checkpoint,
      getPort: () => targetPort,
      isAuthority: false,
      onFailure: vi.fn(),
      runId: "run",
      validateRequest: () => true,
    });
    registrations.get("game/run")?.({ action: orderedAction(6), kind: "ordered-action" });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      kind: "resume",
      lastRevision: 4,
    }));
    controller.receiveFallback({
      blockId: "game",
      kind: "recovery-required",
      requesterId: "student",
      runId: "run",
    });
    expect(targetPort.postMessage).toHaveBeenCalledWith({
      checkpoint,
      kind: "checkpoint",
    });
  });

  it("updates the durable checkpoint cache without a React-facing state contract", () => {
    const { controller } = fixture();
    const checkpoint = {
      checksum: "checksum",
      gameId: "racing",
      logicalTime: 7,
      revision: 7,
      runId: "run",
      seed: 1,
      state: { position: 7 },
      stateVersion: "1",
      updatedAt: 1,
    };
    controller.replaceCheckpoints({ game: checkpoint });
    expect(controller.getCheckpoint("game")).toEqual(checkpoint);
    controller.replaceCheckpoints({});
    expect(controller.getCheckpoint("game")).toBeUndefined();
  });

  it("keeps simultaneous block/run sessions isolated", () => {
    const { controller, registrations } = fixture();
    const firstPort = port();
    const secondPort = port();
    for (const [blockId, targetPort] of [["one", firstPort], ["two", secondPort]] as const) {
      controller.attach({
        actorId: "student",
        blockId,
        getCheckpoint: () => undefined,
        getPort: () => targetPort,
        isAuthority: false,
        onFailure: vi.fn(),
        runId: "run",
        validateRequest: () => true,
      });
    }
    registrations.get("one/run")?.({
      action: orderedAction(1, "one"),
      kind: "ordered-action",
    });
    expect(firstPort.postMessage).toHaveBeenCalledOnce();
    expect(secondPort.postMessage).not.toHaveBeenCalled();
  });

  it("preserves SDK burst and payload limits", () => {
    const { controller, publish } = fixture();
    const targetPort = port();
    const onFailure = vi.fn();
    const attachment = controller.attach({
      actorId: "teacher",
      blockId: "game",
      getCheckpoint: () => undefined,
      getPort: () => targetPort,
      isAuthority: true,
      onFailure,
      runId: "run",
      validateRequest: () => true,
    });
    for (let sequence = 1; sequence <= 31; sequence += 1) {
      attachment.handleOutbound({
        action: {
          actorId: "teacher",
          actorSequence: sequence,
          eventId: `burst-${sequence}`,
          gameId: "racing",
          payload: { delta: 1 },
          runId: "run",
          stateVersion: "1",
          type: "move",
        },
        kind: "action-request",
      });
    }
    expect(publish).toHaveBeenCalledTimes(30);
    expect(onFailure).toHaveBeenCalledOnce();
    expect(targetPort.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      code: "ACTION_RATE_EXCEEDED",
      kind: "rejected",
    }));

    const oversized = controller.attach({
      actorId: "teacher",
      blockId: "large",
      getCheckpoint: () => undefined,
      getPort: () => targetPort,
      isAuthority: true,
      onFailure: vi.fn(),
      runId: "run",
      validateRequest: () => true,
    });
    oversized.handleOutbound({
      action: {
        actorId: "teacher",
        actorSequence: 1,
        eventId: "oversized",
        gameId: "racing",
        payload: { value: "x".repeat(17 * 1024) },
        runId: "run",
        stateVersion: "1",
        type: "move",
      },
      kind: "action-request",
    });
    expect(targetPort.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      code: "ACTION_TOO_LARGE",
      kind: "rejected",
    }));
  });
});

