import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { verifyCollaborationToken } from "./auth.js";
import { collaborationRoomName } from "./rooms.js";

const secret = new TextEncoder().encode("01234567890123456789012345678901");

describe("verifyCollaborationToken", () => {
  it("verifies backend-issued tokens and exposes validated collaboration claims", async () => {
    const token = await signedToken({
      documentId: "11111111-1111-4111-8111-111111111111",
      lessonId: "22222222-2222-4222-8222-222222222222",
      materialId: "33333333-3333-4333-8333-333333333333",
      studentUserId: "44444444-4444-4444-8444-444444444444",
      documentKind: "MATERIAL_WORK",
      scope: "INDIVIDUAL",
      yjsDocumentId: "lesson:22222222-2222-4222-8222-222222222222:material:33333333-3333-4333-8333-333333333333:student:44444444-4444-4444-8444-444444444444:kind:MATERIAL_WORK",
    });

    const claims = await verifyCollaborationToken(token, {
      tokenSecret: "01234567890123456789012345678901",
    });

    expect(claims.documentId).toBe("11111111-1111-4111-8111-111111111111");
    expect(collaborationRoomName(claims)).toBe(claims.yjsDocumentId);
  });

  it("rejects tokens missing required collaboration claims", async () => {
    const token = await signedToken({
      documentId: "11111111-1111-4111-8111-111111111111",
      lessonId: "22222222-2222-4222-8222-222222222222",
      documentKind: "MATERIAL_WORK",
      scope: "GROUP",
      yjsDocumentId: "lesson:22222222-2222-4222-8222-222222222222:material:33333333-3333-4333-8333-333333333333:group:kind:MATERIAL_WORK",
    });

    await expect(
      verifyCollaborationToken(token, {
        tokenSecret: "01234567890123456789012345678901",
      }),
    ).rejects.toThrow(/missing materialId/);
  });
});

async function signedToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("playsay-api-gateway")
    .setSubject("student-1")
    .setExpirationTime("15m")
    .sign(secret);
}
