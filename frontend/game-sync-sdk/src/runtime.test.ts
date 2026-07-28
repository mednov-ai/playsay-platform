import { describe, expect, it, vi } from "vitest";
import { defineGame } from "./runtime";
import { createStandaloneTransport } from "./transport";
import {
  GAME_SYNC_PROTOCOL,
  type GameSyncInboundMessage,
  type GameSyncOutboundMessage,
  type OrderedGameAction,
} from "./types";

const manifest = {
  buildHash: "test",
  gameId: "counter",
  protocol: GAME_SYNC_PROTOCOL,
  reducerVersion: "1",
  stateVersion: "1",
};

describe("defineGame", () => {
  it("applies an action optimistically and converges after authority ordering", async () => {
    const states: number[] = [];
    const game = defineGame({
      initialState: 0,
      manifest,
      onState: (state) => states.push(state),
      reduce: (state, action) => state + Number(action.payload),
      transport: createStandaloneTransport({ actorId: "student", runId: "run", seed: 7 }),
    });

    game.dispatch("increment", 2);
    expect(game.getState()).toBe(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(game.getState()).toBe(2);
    expect(states).toContain(2);
    game.dispose();
  });

  it("provides deterministic random values for the same seed and revision", async () => {
    const run = (values: number[]) => defineGame<number[]>({
      initialState: [],
      manifest,
      onState: () => undefined,
      reduce: (state, _action: OrderedGameAction, context) => [...state, context.random(), context.random()],
      transport: createStandaloneTransport({ actorId: "actor", runId: "same", seed: 42 }),
    });
    const first = run([]);
    const second = run([]);
    first.dispatch("roll", null);
    second.dispatch("roll", null);
    await Promise.resolve();
    await Promise.resolve();
    expect(first.getState()).toEqual(second.getState());
  });

  it("rejects oversized actions before transport", () => {
    const onError = vi.fn();
    const game = defineGame({
      initialState: "",
      manifest,
      onError,
      onState: () => undefined,
      reduce: (state) => state,
      transport: createStandaloneTransport(),
    });
    expect(() => game.dispatch("huge", "x".repeat(17 * 1024))).toThrow(/exceeds/);
    expect(onError).not.toHaveBeenCalled();
  });

  it("rejects invalid action signatures and uncontrolled action rates", () => {
    const game = defineGame({
      initialState: 0,
      manifest,
      onState: () => undefined,
      reduce: (state) => state,
      transport: createStandaloneTransport(),
    });
    expect(() => game.dispatch({ type: "increment" } as unknown as string, null)).toThrow(/non-empty string/);
    for (let index = 0; index < 30; index += 1) {
      game.dispatch("tick", null);
    }
    expect(() => game.dispatch("tick", null)).toThrow("ACTION_RATE_EXCEEDED");
  });

  it("rebases optimistic actions onto the authority seed when context arrives late", () => {
    let receive: ((message: GameSyncInboundMessage) => void) | undefined;
    const sent: GameSyncOutboundMessage[] = [];
    const game = defineGame({
      initialState: (seed) => seed,
      manifest,
      onState: () => undefined,
      reduce: (state, action) => state + Number(action.payload),
      transport: {
        send: (message) => sent.push(message),
        subscribe: (listener) => {
          receive = listener;
          return () => undefined;
        },
      },
    });

    game.dispatch("increment", 2);
    expect(game.getState()).toBe(3);
    receive?.({ actorId: "student", kind: "context", runId: "run", seed: 7 });
    expect(game.getState()).toBe(9);
    expect(sent.filter((message) => message.kind === "action-request")).toHaveLength(1);
  });

  it("applies student input immediately and converges teacher and student through one authority order", () => {
    const listeners = new Map<string, (message: GameSyncInboundMessage) => void>();
    let revision = 0;
    const transport = (actorId: string) => ({
      send(message: GameSyncOutboundMessage) {
        if (message.kind === "hello") {
          listeners.get(actorId)?.({
            actorId,
            kind: "context",
            runId: "shared-run",
            seed: 17,
          });
        } else if (message.kind === "action-request") {
          const action = {
            ...message.action,
            authorityRevision: ++revision,
            logicalTime: revision,
          };
          listeners.forEach((listener) => listener({ action, kind: "ordered-action" }));
        }
      },
      subscribe(listener: (message: GameSyncInboundMessage) => void) {
        listeners.set(actorId, listener);
        return () => listeners.delete(actorId);
      },
    });
    const create = (actorId: string) => defineGame({
      initialState: { started: false, x: 0 },
      manifest,
      onState: () => undefined,
      reduce: (state, action) => action.type === "move"
        ? { ...state, x: state.x + Number(action.payload) }
        : state,
      transport: transport(actorId),
    });
    const teacher = create("teacher");
    const student = create("student");

    student.dispatch("move", 4);

    expect(student.getState().x).toBe(4);
    expect(teacher.getState().x).toBe(4);
    expect(revision).toBe(1);
    teacher.dispose();
    student.dispose();
  });
});
