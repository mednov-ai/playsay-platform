import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";
import type {
  CollaborationBackpressureObserver,
  CollaborationDeliveryClass,
} from "./backpressure.js";
import type { SnapshotMetrics } from "./snapshots.js";

interface RealtimeMetricSnapshot {
  activeConnections: number;
  activeRooms: number;
  bufferedBytes: number;
}

export class CollaborationMetrics implements CollaborationBackpressureObserver, SnapshotMetrics {
  private readonly registry = new Registry();
  private readonly activeConnections = new Gauge({
    help: "Number of active collaboration websocket connections.",
    name: "playsay_collaboration_active_connections",
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

  constructor() {
    collectDefaultMetrics({
      prefix: "playsay_collaboration_",
      register: this.registry,
    });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  recordDropped(deliveryClass: Exclude<CollaborationDeliveryClass, "sync">): void {
    this.droppedMessages.inc({ delivery_class: deliveryClass });
  }

  recordForcedClose(): void {
    this.forcedCloses.inc();
  }

  recordSnapshotFlush(outcome: "saved" | "discard" | "retry", durationSeconds: number): void {
    this.snapshotFlushDuration.observe({ outcome }, durationSeconds);
  }

  setSnapshotQueueSize(size: number): void {
    this.snapshotQueueSize.set(size);
  }

  async render(snapshot: RealtimeMetricSnapshot): Promise<string> {
    this.activeConnections.set(snapshot.activeConnections);
    this.activeRooms.set(snapshot.activeRooms);
    this.bufferedBytes.set(snapshot.bufferedBytes);
    return this.registry.metrics();
  }
}
