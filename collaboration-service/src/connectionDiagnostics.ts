import type { CollaborationChannel, CollaborationCloseClass } from "./heartbeat.js";

export type ConnectionEvent = "connection_opened" | "connection_closed" | "heartbeat_termination" | "connection_error";

/** No socket, identity, exception, URL or payload may enter this logger. */
export class ConnectionDiagnostics {
  private window = 0;
  private emitted = 0;

  constructor(
    private readonly enabled = process.env.CONNECTION_DIAGNOSTICS_ENABLED === "true",
    private readonly write: (line: string) => void = line => { process.stdout.write(line); },
    private readonly pendingBytes: () => number = () => process.stdout.writableLength,
    private readonly now: () => number = Date.now,
    private readonly suppressed: () => void = () => {},
  ) {}

  record(event: ConnectionEvent, channel: CollaborationChannel, closeClass?: CollaborationCloseClass, ageSeconds?: number): void {
    if (!this.enabled) return;
    const timestamp = this.now();
    const window = Math.floor(timestamp / 1000);
    if (window !== this.window) { this.window = window; this.emitted = 0; }
    if (this.emitted >= 100 || this.pendingBytes() >= 16_384) { this.suppressed(); return; }
    this.emitted += 1;
    // Reconstruct fields explicitly; never spread caller objects into output.
    const record: Record<string, string | number> = {
      timestamp: new Date(timestamp).toISOString(), event, channel,
      severity: event === "connection_error" || event === "heartbeat_termination" ? "warn" : "info",
    };
    if (closeClass) record.close_class = closeClass;
    if (ageSeconds !== undefined && Number.isFinite(ageSeconds)) record.age_seconds = Math.max(0, Math.min(ageSeconds, 604_800));
    try { this.write(`${JSON.stringify(record)}\n`); } catch { this.suppressed(); }
  }
}
