import { WebSocket } from "ws";

export type CollaborationDeliveryClass = "sync" | "awareness" | "ephemeral";

export interface CollaborationBackpressurePolicy {
  softLimitBytes: number;
  hardLimitBytes: number;
}

export interface CollaborationBackpressureObserver {
  recordDropped(deliveryClass: Exclude<CollaborationDeliveryClass, "sync">): void;
  recordForcedClose(): void;
}

export function sendWithBackpressure(
  ws: WebSocket,
  payload: Parameters<WebSocket["send"]>[0],
  deliveryClass: CollaborationDeliveryClass,
  policy: CollaborationBackpressurePolicy,
  observer: CollaborationBackpressureObserver,
): boolean {
  if (ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  if (ws.bufferedAmount >= policy.hardLimitBytes) {
    observer.recordForcedClose();
    ws.close(1013, "collaboration client is too slow; reconnect to resync");
    return false;
  }

  if (deliveryClass !== "sync" && ws.bufferedAmount >= policy.softLimitBytes) {
    observer.recordDropped(deliveryClass);
    return false;
  }

  ws.send(payload);
  return true;
}
