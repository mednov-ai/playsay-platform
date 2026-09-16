import type { WebSocket } from "ws";
import { sendWithBackpressure, type CollaborationBackpressurePolicy } from "./backpressure.js";
import { externalActivityRealtimeSubprotocol, parseExternalActivityFrame } from "./externalActivityProtocol.js";

export interface ExternalActivityRelayObserver {
  recordDropped(deliveryClass: "awareness" | "ephemeral" | "external-cursor"): void;
  recordForcedClose(): void;
  recordExternalActivityRelay(
    stage: "external-input" | "external-result" | "external-cursor",
    result: string,
    payloadBytes: number,
    durationSeconds: number,
  ): void;
  recordExternalActivityFailure(record: {
    correlationId: string;
    result: string;
    stage: "acknowledgement";
    timestamp: string;
    transport: "fast-lane";
  }): void;
}

export function relayExternalActivityFrame(
  connections: Iterable<WebSocket>,
  origin: WebSocket,
  bytes: Uint8Array,
  policy: CollaborationBackpressurePolicy,
  observer: ExternalActivityRelayObserver,
): void {
  const startedAt = performance.now();
  const frame = parseExternalActivityFrame(bytes);
  for (const connection of connections) {
    if (
      connection !== origin
      && connection.protocol === externalActivityRealtimeSubprotocol
      && connection.readyState === connection.OPEN
    ) {
      sendWithBackpressure(connection, bytes, frame.kind, policy, observer);
    }
  }
  const result = frame.kind === "external-result" ? frame.result : "accepted";
  observer.recordExternalActivityRelay(frame.kind, result, bytes.byteLength, (performance.now() - startedAt) / 1000);
  if (frame.kind === "external-result" && frame.result !== "DISPATCHED") {
    observer.recordExternalActivityFailure({
      correlationId: frame.eventId,
      result: frame.result,
      stage: "acknowledgement",
      timestamp: new Date().toISOString(),
      transport: "fast-lane",
    });
  }
}
