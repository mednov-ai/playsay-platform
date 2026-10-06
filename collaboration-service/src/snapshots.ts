import * as Y from "yjs";
import type { CollaborationClaims } from "./rooms.js";

export interface SnapshotConfig {
  playsayApiBaseUrl: string;
  collaborationServiceToken: string;
  snapshotIntervalMs: number;
  snapshotBudgetBytes?: number;
  snapshotRetryWindowMs?: number;
}
export type SnapshotOutcome = "saved" | "retry" | "document_invalid" | "unsaved";
export class InvalidCollaborationDocument extends Error {
  constructor() { super("collaboration document unavailable"); }
}
export class SnapshotCapacityError extends Error {
  constructor() { super("snapshot retention unavailable"); }
}
export interface SnapshotMetrics {
  recordSnapshotFlush(outcome: "saved" | "discard" | "retry", durationSeconds: number): void;
  setSnapshotQueueSize(size: number): void;
}
interface PendingSnapshot {
  claims: CollaborationClaims;
  body: string;
  bytes: number;
  firstFailure: number | null;
  failures: number;
  nextAttempt: number;
  terminal: boolean;
}
export class SnapshotQueue {
  private readonly pending = new Map<string, PendingSnapshot>();
  private interval: NodeJS.Timeout | undefined;
  private flushing: Promise<void> | null = null;
  private retainedBytes = 0;
  onOutcome?: (claims: CollaborationClaims, outcome: SnapshotOutcome) => void;
  constructor(private readonly config: SnapshotConfig, private readonly metrics?: SnapshotMetrics) {}
  hasPending(documentId?: string): boolean {
    return documentId ? this.pending.has(documentId) : this.pending.size > 0;
  }
  assertCanApply(claims: CollaborationClaims, doc: Y.Doc, update: Uint8Array): void {
    const candidate = new Y.Doc();
    try {
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
      Y.applyUpdate(candidate, update);
      this.assertCapacity(claims, this.serialize(candidate).bytes);
    } finally { candidate.destroy(); }
  }
  markDirty(claims: CollaborationClaims, doc: Y.Doc): void {
    const encoded = this.serialize(doc);
    this.assertCapacity(claims, encoded.bytes);
    const previous = this.pending.get(claims.documentId);
    this.retainedBytes += encoded.bytes - (previous?.bytes ?? 0);
    this.pending.set(claims.documentId, {
      claims, ...encoded, firstFailure: previous?.firstFailure ?? null,
      failures: previous?.failures ?? 0, nextAttempt: previous?.nextAttempt ?? 0,
      terminal: previous?.terminal ?? false,
    });
    this.metrics?.setSnapshotQueueSize(this.pending.size);
  }
  private serialize(doc: Y.Doc): { body: string; bytes: number } {
    const snapshot = {
      schemaVersion: 1, encoding: "yjs-update-v1",
      yjsUpdateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
      savedAt: new Date().toISOString(),
    };
    const body = JSON.stringify({ snapshot });
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 1_000_000) throw new SnapshotCapacityError();
    return { body, bytes: Buffer.byteLength(body) };
  }
  private assertCapacity(claims: CollaborationClaims, bytes: number): void {
    const previous = this.pending.get(claims.documentId);
    if ((!previous && this.pending.size >= 4096) || previous?.terminal || this.retainedBytes - (previous?.bytes ?? 0) + bytes > (this.config.snapshotBudgetBytes ?? 64 * 1024 * 1024)) {
      this.onOutcome?.(claims, "unsaved");
      throw new SnapshotCapacityError();
    }
  }
  start(): void {
    if (!this.interval) this.interval = setInterval(() => { void this.flushAll(); }, this.config.snapshotIntervalMs);
  }
  stop(): void { if (this.interval) clearInterval(this.interval); this.interval = undefined; }
  async load(claims: CollaborationClaims): Promise<unknown | null> {
    const { response, document } = await this.request(claims);
    if (response.status === 404) throw new InvalidCollaborationDocument();
    if (!response.ok) throw new Error("snapshot restore unavailable");
    const pending = this.pending.get(claims.documentId);
    if (pending?.terminal) {
      // A fresh authorized rejoin is the explicit recovery action for retained unsaved state.
      pending.terminal = false; pending.firstFailure = null; pending.failures = 0; pending.nextAttempt = 0;
    }
    return pending ? JSON.parse(pending.body).snapshot : document?.snapshot ?? null;
  }
  async flushAll(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.drain();
    try { await this.flushing; } finally { this.flushing = null; }
  }
  private async drain(): Promise<void> {
    const entries = [...this.pending.values()].filter(entry => !entry.terminal && entry.nextAttempt <= Date.now());
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
      while (index < entries.length) await this.flush(entries[index++]);
    }));
  }
  private async request(claims: CollaborationClaims, body?: string): Promise<{ response: Response; document?: { snapshot?: unknown } }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(new URL(`/schedule/lessons/${claims.lessonId}/collaboration-documents/${claims.documentId}/snapshot`, this.config.playsayApiBaseUrl), {
        signal: controller.signal, ...(body === undefined ? {} : { method: "PUT", body }),
        headers: { "x-playsay-collaboration-service-token": this.config.collaborationServiceToken, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      });
      const document = body === undefined && response.ok ? await response.json() as { snapshot?: unknown } : undefined;
      if (body !== undefined || !response.ok) await response.body?.cancel();
      return { response, document };
    } finally { clearTimeout(timer); }
  }
  private async flush(entry: PendingSnapshot): Promise<void> {
    const start = performance.now();
    const response = (await this.request(entry.claims, entry.body).catch(() => null))?.response;
    let outcome: SnapshotOutcome;
    if (response?.ok) {
      outcome = "saved";
      if (this.pending.get(entry.claims.documentId) === entry) this.remove(entry.claims.documentId);
    } else if (response?.status === 404) {
      outcome = "document_invalid";
      this.remove(entry.claims.documentId);
    } else {
      const current = this.pending.get(entry.claims.documentId);
      outcome = "retry";
      if (current) {
        current.firstFailure ??= Date.now();
        current.failures += 1;
        const retryable = !response || response.status === 408 || response.status === 429 || response.status >= 500;
        if (!retryable || Date.now() - current.firstFailure >= (this.config.snapshotRetryWindowMs ?? 900_000)) {
          current.terminal = true; outcome = "unsaved";
        } else current.nextAttempt = Date.now() + Math.min(60_000, 1_000 * 2 ** Math.min(current.failures - 1, 6)) * (0.8 + Math.random() * 0.2);
      }
    }
    this.metrics?.recordSnapshotFlush(outcome === "saved" ? "saved" : outcome === "document_invalid" ? "discard" : "retry", (performance.now() - start) / 1_000);
    if (outcome !== "saved") console.warn(JSON.stringify({ event: "snapshot_outcome", outcome, severity: "warn" }));
    this.onOutcome?.(entry.claims, outcome);
  }
  private remove(id: string): void {
    const current = this.pending.get(id);
    if (current) this.retainedBytes -= current.bytes;
    this.pending.delete(id);
    this.metrics?.setSnapshotQueueSize(this.pending.size);
  }
}
