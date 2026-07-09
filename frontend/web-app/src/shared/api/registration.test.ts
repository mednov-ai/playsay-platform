import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { consumeStudentInviteRequest, isRegistrationRateLimitError } from "./registration";

vi.mock("./locale", () => ({
  currentApiLanguage: () => "en",
}));

describe("registration API errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recognizes registration rate limit errors", () => {
    expect(isRegistrationRateLimitError(new ApiError(429, "REGISTRATION_RATE_LIMITED", "Too many attempts"))).toBe(true);
    expect(isRegistrationRateLimitError(new ApiError(500, "REGISTRATION_REQUEST_FAILED", "Failed"))).toBe(false);
  });

  it("uses the public student invite endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({
        accessToken: "access",
        continueUrl: "/lessons/lesson-1/classroom",
        expiresIn: 300,
        idToken: "id",
        refreshToken: "refresh",
      }), { status: 200 })),
    );

    await expect(consumeStudentInviteRequest("invite token")).resolves.toMatchObject({
      accessToken: "access",
      continueUrl: "/lessons/lesson-1/classroom",
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/student-invites/consume",
      expect.objectContaining({
        body: JSON.stringify({ token: "invite token" }),
        method: "POST",
      }),
    );
  });

  it("accepts waiting student invite response without auth tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({
        status: "WAITING",
        opensAt: "2026-05-25T09:50:00Z",
        scheduledStart: "2026-05-25T10:00:00Z",
        scheduledEnd: "2026-05-25T10:45:00Z",
        retryAfterSeconds: 600,
      }), { status: 200 })),
    );

    await expect(consumeStudentInviteRequest("A7K2Q9")).resolves.toMatchObject({
      status: "WAITING",
      opensAt: "2026-05-25T09:50:00Z",
      retryAfterSeconds: 600,
    });
  });
});
