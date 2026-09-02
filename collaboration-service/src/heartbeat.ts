import type { WebSocket, WebSocketServer } from "ws";

export type CollaborationChannel = "game" | "yjs";
export type CollaborationCloseClass = "heartbeat" | "normal" | "transport";

export interface CollaborationConnectionObserver {
  recordConnectionClosed(
    channel: CollaborationChannel,
    closeClass: CollaborationCloseClass,
    ageSeconds: number,
  ): void;
  recordConnectionOpened(channel: CollaborationChannel): void;
  recordHeartbeatTermination(channel: CollaborationChannel): void;
}

interface HeartbeatState {
  alive: boolean;
  channel: CollaborationChannel;
  heartbeatTermination: boolean;
  missedPongs: number;
  openedAt: number;
}

export class CollaborationHeartbeat {
  private timer: NodeJS.Timeout | null = null;
  private readonly states = new Map<WebSocket, HeartbeatState>();

  constructor(
    private readonly server: WebSocketServer,
    private readonly intervalMs: number,
    private readonly missedPongsBeforeTermination: number,
    private readonly observer: CollaborationConnectionObserver,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  track(socket: WebSocket, channel: CollaborationChannel): void {
    const state: HeartbeatState = {
      alive: true,
      channel,
      heartbeatTermination: false,
      missedPongs: 0,
      openedAt: performance.now(),
    };
    this.states.set(socket, state);
    this.observer.recordConnectionOpened(channel);
    socket.on("pong", () => {
      const current = this.states.get(socket);
      if (!current) return;
      current.alive = true;
      current.missedPongs = 0;
    });
    socket.once("close", (code) => {
      const current = this.states.get(socket);
      if (!current) return;
      this.states.delete(socket);
      const closeClass: CollaborationCloseClass = current.heartbeatTermination
        ? "heartbeat"
        : code === 1000 || code === 1001 ? "normal" : "transport";
      this.observer.recordConnectionClosed(
        current.channel,
        closeClass,
        (performance.now() - current.openedAt) / 1000,
      );
    });
  }

  private tick(): void {
    this.server.clients.forEach((socket) => {
      const state = this.states.get(socket);
      if (!state || socket.readyState !== socket.OPEN) return;
      if (state.alive) {
        state.alive = false;
        state.missedPongs = 0;
        socket.ping();
        return;
      }
      state.missedPongs += 1;
      if (state.missedPongs < this.missedPongsBeforeTermination) {
        socket.ping();
        return;
      }
      state.heartbeatTermination = true;
      this.observer.recordHeartbeatTermination(state.channel);
      socket.terminate();
    });
  }
}
