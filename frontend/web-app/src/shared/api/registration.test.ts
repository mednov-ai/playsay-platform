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
});
