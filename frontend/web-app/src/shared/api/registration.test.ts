import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { isRegistrationRateLimitError } from "./registration";

describe("registration API errors", () => {
  it("recognizes registration rate limit errors", () => {
    expect(isRegistrationRateLimitError(new ApiError(429, "REGISTRATION_RATE_LIMITED", "Too many attempts"))).toBe(true);
    expect(isRegistrationRateLimitError(new ApiError(500, "REGISTRATION_REQUEST_FAILED", "Failed"))).toBe(false);
  });
});
