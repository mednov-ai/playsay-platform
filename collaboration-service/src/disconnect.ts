import type { WebSocket } from "ws";
import type { CollaborationClaims } from "./rooms.js";

export function disconnectLessonSubject(
  claimsBySocket: Map<WebSocket, CollaborationClaims>,
  lessonId: string,
  subject: string,
): number {
  let disconnected = 0;
  claimsBySocket.forEach((claims, socket) => {
    if (claims.lessonId === lessonId && claims.subject === subject) {
      disconnected += 1;
      socket.close(4003, "lesson access revoked");
    }
  });
  return disconnected;
}
