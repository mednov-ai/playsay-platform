import * as Y from "yjs";
import type { CollaborationClaims } from "./rooms.js";

export interface SnapshotConfig {
  playsayApiBaseUrl: string;
  collaborationServiceToken: string;
  snapshotIntervalMs: number;
}

export interface SnapshotMetrics {
  recordSnapshotFlush(outcome: "saved" | "discard" | "retry", durationSeconds: number): void;
  setSnapshotQueueSize(size: number): void;
}

interface DirtyRoom {
  claims: CollaborationClaims;
  doc: Y.Doc;
}

export class SnapshotQueue {
  private readonly dirtyRooms = new Map<string, DirtyRoom>();
  private interval: NodeJS.Timeout | undefined;
  private flushing: Promise<void> | null = null;

  constructor(
    private readonly config: SnapshotConfig,
    private readonly metrics?: SnapshotMetrics,
  ) {}

  markDirty(claims: CollaborationClaims, doc: Y.Doc): void {
    this.dirtyRooms.set(claims.documentId, { claims, doc });
    this.metrics?.setSnapshotQueueSize(this.dirtyRooms.size);
  }

  start(): void {
    if (this.interval) {
      return;
    }
    this.interval = setInterval(() => {
      void this.flushAll();
    }, this.config.snapshotIntervalMs);
  }

  stop(): void {
    if (!this.interval) {
      return;
    }
    clearInterval(this.interval);
    this.interval = undefined;
  }

  async load(claims: CollaborationClaims): Promise<unknown | null> {
    const url = new URL(
      `/schedule/lessons/${claims.lessonId}/collaboration-documents/${claims.documentId}/snapshot`,
      this.config.playsayApiBaseUrl,
    );
    const response = await fetch(url, {
      headers: {
        "x-playsay-collaboration-service-token": this.config.collaborationServiceToken,
      },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`snapshot restore failed with HTTP ${response.status}`);
    const document = await response.json() as { snapshot?: unknown };
    return document.snapshot ?? null;
  }

  async flushAll(): Promise<void> {
    if (this.flushing) {
      return this.flushing;
    }
    this.flushing = this.drain();
    try {
      await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  private async drain(): Promise<void> {
    const entries = [...this.dirtyRooms.values()];
    this.dirtyRooms.clear();
    this.metrics?.setSnapshotQueueSize(0);
    await Promise.all(entries.map((entry) => this.flushWithRecovery(entry)));
  }

  private async flushWithRecovery(entry: DirtyRoom): Promise<void> {
    const result = await this.flush(entry);
    if (result === "retry" && !this.dirtyRooms.has(entry.claims.documentId)) {
      this.dirtyRooms.set(entry.claims.documentId, entry);
      this.metrics?.setSnapshotQueueSize(this.dirtyRooms.size);
    }
  }

  private async flush(entry: DirtyRoom): Promise<"saved" | "discard" | "retry"> {
    const startedAt = performance.now();
    const snapshot = {
      schemaVersion: 1,
      encoding: "yjs-update-v1",
      yjsUpdateBase64: Buffer.from(Y.encodeStateAsUpdate(entry.doc)).toString("base64"),
      savedAt: new Date().toISOString(),
    };
    const url = new URL(
      `/schedule/lessons/${entry.claims.lessonId}/collaboration-documents/${entry.claims.documentId}/snapshot`,
      this.config.playsayApiBaseUrl,
    );

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "x-playsay-collaboration-service-token": this.config.collaborationServiceToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ snapshot }),
    }).catch((error: unknown) => {
      console.warn(snapshotFailureMessage(entry, error));
      return null;
    });

    let outcome: "saved" | "discard" | "retry";
    if (!response) {
      outcome = "retry";
    } else if (!response.ok) {
      console.warn(snapshotFailureMessage(entry, `HTTP ${response.status}`));
      outcome = isRetryableSnapshotStatus(response.status) ? "retry" : "discard";
    } else {
      outcome = "saved";
    }
    this.metrics?.recordSnapshotFlush(outcome, (performance.now() - startedAt) / 1000);
    return outcome;
  }
}

function isRetryableSnapshotStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function snapshotFailureMessage(entry: DirtyRoom, reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return `snapshot persistence failed for document ${entry.claims.documentId}: ${detail}`;
}
