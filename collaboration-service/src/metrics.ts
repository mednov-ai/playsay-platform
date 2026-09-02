import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";
import type {
  CollaborationBackpressureObserver,
} from "./backpressure.js";
import type { SnapshotMetrics } from "./snapshots.js";
import type {
  CollaborationChannel,
  CollaborationCloseClass,
  CollaborationConnectionObserver,
} from "./heartbeat.js";

interface RealtimeMetricSnapshot {
  activeConnections: number;
  activeGameConnections: number;
  activeRooms: number;
  bufferedBytes: number;
  gameBufferedBytes: number;
}

export class CollaborationMetrics implements CollaborationBackpressureObserver, CollaborationConnectionObserver, SnapshotMetrics {
  private readonly registry = new Registry();
  private readonly activeConnections = new Gauge({
    help: "Number of active collaboration websocket connections.",
    name: "playsay_collaboration_active_connections",
    registers: [this.registry],
  });
  private readonly activeGameConnections = new Gauge({
    help: "Number of active low-latency game websocket connections.",
    name: "playsay_collaboration_game_active_connections",
    registers: [this.registry],
  });
  private readonly activeConnectionsByChannel = new Gauge({
    help: "Number of active collaboration websocket connections by channel class.",
    labelNames: ["channel"] as const,
    name: "playsay_collaboration_channel_active_connections",
    registers: [this.registry],
  });
  private readonly activeRooms = new Gauge({
    help: "Number of active in-memory collaboration rooms.",
    name: "playsay_collaboration_active_rooms",
    registers: [this.registry],
  });
  private readonly bufferedBytes = new Gauge({
    help: "Total websocket bytes buffered for collaboration clients.",
    name: "playsay_collaboration_websocket_buffered_bytes",
    registers: [this.registry],
  });
  private readonly gameBufferedBytes = new Gauge({
    help: "Websocket bytes buffered only for low-latency game clients.",
    name: "playsay_collaboration_game_websocket_buffered_bytes",
    registers: [this.registry],
  });
  private readonly droppedMessages = new Counter({
    help: "Non-durable collaboration messages dropped due to websocket backpressure.",
    labelNames: ["delivery_class"] as const,
    name: "playsay_collaboration_backpressure_dropped_total",
    registers: [this.registry],
  });
  private readonly forcedCloses = new Counter({
    help: "Collaboration clients closed at the hard backpressure limit.",
    name: "playsay_collaboration_backpressure_forced_closes_total",
    registers: [this.registry],
  });
  private readonly ephemeralMessages = new Counter({
    help: "Ephemeral collaboration messages relayed between room participants.",
    name: "playsay_collaboration_ephemeral_messages_total",
    registers: [this.registry],
  });
  private readonly ephemeralBytes = new Counter({
    help: "Ephemeral collaboration payload bytes accepted for relay.",
    name: "playsay_collaboration_ephemeral_bytes_total",
    registers: [this.registry],
  });
  private readonly ephemeralRelayDuration = new Histogram({
    buckets: [0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025],
    help: "In-process ephemeral room relay duration in seconds.",
    name: "playsay_collaboration_ephemeral_relay_duration_seconds",
    registers: [this.registry],
  });
  private readonly gameMessages = new Counter({
    help: "Low-latency game messages relayed between room participants.",
    labelNames: ["message_type"] as const,
    name: "playsay_collaboration_game_messages_total",
    registers: [this.registry],
  });
  private readonly gameBytes = new Counter({
    help: "Low-latency game payload bytes accepted for relay.",
    name: "playsay_collaboration_game_bytes_total",
    registers: [this.registry],
  });
  private readonly gameRelayDuration = new Histogram({
    buckets: [0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025],
    help: "In-process low-latency game relay duration in seconds.",
    name: "playsay_collaboration_game_relay_duration_seconds",
    registers: [this.registry],
  });
  private readonly snapshotQueueSize = new Gauge({
    help: "Number of collaboration documents waiting for snapshot persistence.",
    name: "playsay_collaboration_snapshot_queue_size",
    registers: [this.registry],
  });
  private readonly snapshotFlushDuration = new Histogram({
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    help: "Collaboration snapshot persistence duration in seconds.",
    labelNames: ["outcome"] as const,
    name: "playsay_collaboration_snapshot_flush_duration_seconds",
    registers: [this.registry],
  });
  private readonly connectionOpens = new Counter({
    help: "Collaboration websocket connections opened by channel class.",
    labelNames: ["channel"] as const,
    name: "playsay_collaboration_connection_opens_total",
    registers: [this.registry],
  });
  private readonly connectionCloses = new Counter({
    help: "Collaboration websocket connections closed by channel and close class.",
    labelNames: ["channel", "close_class"] as const,
    name: "playsay_collaboration_connection_closes_total",
    registers: [this.registry],
  });
  private readonly connectionAge = new Histogram({
    buckets: [1, 5, 15, 30, 60, 300, 900, 1800, 3600, 7200],
    help: "Age of collaboration websocket connections when closed.",
    labelNames: ["channel", "close_class"] as const,
    name: "playsay_collaboration_connection_age_seconds",
    registers: [this.registry],
  });
  private readonly heartbeatTerminations = new Counter({
    help: "Stale collaboration websocket connections terminated by heartbeat.",
    labelNames: ["channel"] as const,
    name: "playsay_collaboration_heartbeat_terminations_total",
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({
      prefix: "playsay_collaboration_",
      register: this.registry,
    });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  recordDropped(deliveryClass: "awareness" | "ephemeral"): void {
    this.droppedMessages.inc({ delivery_class: deliveryClass });
  }

  recordForcedClose(): void {
    this.forcedCloses.inc();
  }

  recordEphemeralRelay(payloadBytes: number, durationSeconds: number): void {
    this.ephemeralMessages.inc();
    this.ephemeralBytes.inc(payloadBytes);
    this.ephemeralRelayDuration.observe(durationSeconds);
  }

  recordGameRelay(messageType: number, payloadBytes: number, durationSeconds: number): void {
    this.gameMessages.inc({ message_type: String(messageType) });
    this.gameBytes.inc(payloadBytes);
    this.gameRelayDuration.observe(durationSeconds);
  }

  recordSnapshotFlush(outcome: "saved" | "discard" | "retry", durationSeconds: number): void {
    this.snapshotFlushDuration.observe({ outcome }, durationSeconds);
  }

  setSnapshotQueueSize(size: number): void {
    this.snapshotQueueSize.set(size);
  }

  recordConnectionOpened(channel: CollaborationChannel): void {
    this.connectionOpens.inc({ channel });
  }

  recordConnectionClosed(
    channel: CollaborationChannel,
    closeClass: CollaborationCloseClass,
    ageSeconds: number,
  ): void {
    this.connectionCloses.inc({ channel, close_class: closeClass });
    this.connectionAge.observe({ channel, close_class: closeClass }, ageSeconds);
  }

  recordHeartbeatTermination(channel: CollaborationChannel): void {
    this.heartbeatTerminations.inc({ channel });
  }

  async render(snapshot: RealtimeMetricSnapshot): Promise<string> {
    this.activeConnections.set(snapshot.activeConnections);
    this.activeGameConnections.set(snapshot.activeGameConnections);
    this.activeConnectionsByChannel.set(
      { channel: "game" },
      snapshot.activeGameConnections,
    );
    this.activeConnectionsByChannel.set(
      { channel: "yjs" },
      snapshot.activeConnections - snapshot.activeGameConnections,
    );
    this.activeRooms.set(snapshot.activeRooms);
    this.bufferedBytes.set(snapshot.bufferedBytes);
    this.gameBufferedBytes.set(snapshot.gameBufferedBytes);
    return this.registry.metrics();
  }
}
