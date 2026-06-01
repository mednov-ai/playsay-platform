import * as Y from "yjs";
import type { CollaborationClaims } from "./rooms.js";

export interface SnapshotConfig {
  playsayApiBaseUrl: string;
  collaborationServiceToken: string;
  snapshotIntervalMs: number;
}

interface DirtyRoom {
  claims: CollaborationClaims;
  doc: Y.Doc;
}

export class SnapshotQueue {
  private readonly dirtyRooms = new Map<string, DirtyRoom>();
  private interval: NodeJS.Timeout | undefined;

  constructor(private readonly config: SnapshotConfig) {}

  markDirty(claims: CollaborationClaims, doc: Y.Doc): void {
    this.dirtyRooms.set(claims.documentId, { claims, doc });
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

  async flushAll(): Promise<void> {
    const entries = [...this.dirtyRooms.values()];
    this.dirtyRooms.clear();

    await Promise.all(entries.map((entry) => this.flushWithRecovery(entry)));
  }

  private async flushWithRecovery(entry: DirtyRoom): Promise<void> {
    const result = await this.flush(entry);
    if (result === "retry") {
      this.dirtyRooms.set(entry.claims.documentId, entry);
    }
  }

  private async flush(entry: DirtyRoom): Promise<"saved" | "discard" | "retry"> {
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

    if (!response) {
      return "retry";
    }

    if (!response.ok) {
      console.warn(snapshotFailureMessage(entry, `HTTP ${response.status}`));
      return isRetryableSnapshotStatus(response.status) ? "retry" : "discard";
    }
    return "saved";
  }
}

function isRetryableSnapshotStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function snapshotFailureMessage(entry: DirtyRoom, reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return `snapshot persistence failed for document ${entry.claims.documentId}: ${detail}`;
}
