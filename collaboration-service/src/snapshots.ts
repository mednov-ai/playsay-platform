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

    await Promise.all(entries.map((entry) => this.flush(entry)));
  }

  private async flush(entry: DirtyRoom): Promise<void> {
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
        "authorization": `Bearer ${this.config.collaborationServiceToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ snapshot }),
    });

    if (!response.ok) {
      throw new Error(`snapshot persistence failed with HTTP ${response.status}`);
    }
  }
}
