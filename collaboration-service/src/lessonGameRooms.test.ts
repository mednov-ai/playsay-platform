import { describe, expect, it } from "vitest";
import { assertRoomMatchesClaims, validateCollaborationClaims } from "./rooms.js";

describe("lesson game room trust boundary", () => {
  const room = "lesson:lesson-one:game:launch-one:group:kind:LESSON_GAME";
  const claims = { sub: "student", documentId: "document-one", lessonId: "lesson-one", materialId: null, gameLaunchId: "launch-one", documentKind: "LESSON_GAME", scope: "GROUP", yjsDocumentId: room };
  it("accepts a signed lesson-owned binding without a material", () => {
    expect(validateCollaborationClaims(claims).gameLaunchId).toBe("launch-one");
  });
  it("rejects another launch, lesson, material binding and individual scope", () => {
    const valid = validateCollaborationClaims(claims);
    expect(() => assertRoomMatchesClaims(room.replace("launch-one", "launch-two"), valid)).toThrow();
    expect(() => validateCollaborationClaims({ ...claims, lessonId: "another-lesson" })).toThrow();
    expect(() => validateCollaborationClaims({ ...claims, materialId: "fake-material" })).toThrow();
    expect(() => validateCollaborationClaims({ ...claims, scope: "INDIVIDUAL", studentUserId: "student" })).toThrow();
  });
  it("does not accept nullable material for ordinary documents", () => {
    expect(() => validateCollaborationClaims({ ...claims, documentKind: "MATERIAL_WORK" })).toThrow();
  });
  it("keeps board, game and material token bindings separate", () => {
    expect(() => validateCollaborationClaims({ ...claims, whiteboardId: "board-one", contentEpoch: 0 })).toThrow();
    const board = { ...claims, gameLaunchId: null, whiteboardId: "board-one", contentEpoch: 0, documentKind: "LESSON_WHITEBOARD", yjsDocumentId: "lesson:lesson-one:whiteboard:board-one:epoch:0" };
    expect(validateCollaborationClaims(board).whiteboardId).toBe("board-one");
    expect(() => validateCollaborationClaims({ ...board, gameLaunchId: "launch-one" })).toThrow();
    expect(() => validateCollaborationClaims({ ...board, materialId: "material-one" })).toThrow();
    expect(() => validateCollaborationClaims({ ...board, scope: "INDIVIDUAL" })).toThrow();
  });
});
