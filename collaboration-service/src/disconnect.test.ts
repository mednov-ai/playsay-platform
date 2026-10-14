import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { disconnectLessonSubject } from "./disconnect.js";
import type { CollaborationClaims } from "./rooms.js";

describe("disconnectLessonSubject", () => {
  it("closes only sockets for the exact lesson and subject", () => {
    const target = socket();
    const otherLesson = socket();
    const otherSubject = socket();
    const claims = new Map<WebSocket, CollaborationClaims>([
      [target, fixture("lesson-1", "student-1")],
      [otherLesson, fixture("lesson-2", "student-1")],
      [otherSubject, fixture("lesson-1", "student-2")],
    ]);

    expect(disconnectLessonSubject(claims, "lesson-1", "student-1")).toBe(1);
    expect(target.close).toHaveBeenCalledWith(4003, "lesson access revoked");
    expect(otherLesson.close).not.toHaveBeenCalled();
    expect(otherSubject.close).not.toHaveBeenCalled();
  });
});

function socket(): WebSocket {
  return { close: vi.fn() } as unknown as WebSocket;
}

function fixture(lessonId: string, subject: string): CollaborationClaims {
  return {
    subject,
    documentId: "document-1",
    lessonId,
    materialId: "material-1",
    documentKind: "MATERIAL_WORK",
    scope: "GROUP",
    yjsDocumentId: `lesson:${lessonId}:material:material-1:group:kind:MATERIAL_WORK`,
  };
}
