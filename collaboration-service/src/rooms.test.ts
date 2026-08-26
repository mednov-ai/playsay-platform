import { describe, expect, it } from "vitest";
import { assertRoomMatchesClaims, collaborationRoomName } from "./rooms.js";

const baseClaims = {
  subject: "student-1",
  documentId: "11111111-1111-4111-8111-111111111111",
  lessonId: "22222222-2222-4222-8222-222222222222",
  materialId: "33333333-3333-4333-8333-333333333333",
  documentKind: "MATERIAL_WORK",
  yjsDocumentId: "ignored-by-room-builder",
};

describe("collaborationRoomName", () => {
  it("builds individual room names from lesson material student and kind claims", () => {
    expect(
      collaborationRoomName({
        ...baseClaims,
        scope: "INDIVIDUAL",
        studentUserId: "44444444-4444-4444-8444-444444444444",
      }),
    ).toBe(
      "lesson:22222222-2222-4222-8222-222222222222:material:33333333-3333-4333-8333-333333333333:student:44444444-4444-4444-8444-444444444444:kind:MATERIAL_WORK",
    );
  });

  it("builds group room names without trusting a student id", () => {
    expect(
      collaborationRoomName({
        ...baseClaims,
        scope: "GROUP",
        studentUserId: "44444444-4444-4444-8444-444444444444",
      }),
    ).toBe(
      "lesson:22222222-2222-4222-8222-222222222222:material:33333333-3333-4333-8333-333333333333:group:kind:MATERIAL_WORK",
    );
  });

  it("rejects individual claims without a student user id", () => {
    expect(() => collaborationRoomName({ ...baseClaims, scope: "INDIVIDUAL" })).toThrow(/studentUserId/);
  });

  it("rejects websocket URL room ids that do not match token claims", () => {
    const claims = {
      ...baseClaims,
      scope: "GROUP",
    } as const;

    expect(() => assertRoomMatchesClaims("lesson:wrong", claims)).toThrow(/room does not match token claims/);
  });
});
