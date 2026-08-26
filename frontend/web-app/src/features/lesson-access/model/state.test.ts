import { describe, expect, it } from "vitest";
import { accountLabelFromIdToken, lessonTokenFromHash, stepForStatus } from "./state";

describe("lesson access state", () => {
  it.each([
    ["CONFIRMATION_REQUIRED", "choose"],
    ["CODE_SENT_IF_ELIGIBLE", "email-code"],
    ["WAITING_FOR_WINDOW", "waiting"],
    ["WAITING_FOR_TEACHER", "waiting"],
    ["DENIED", "denied"],
    ["CLOSED", "closed"],
    ["unexpected", "error"],
  ])("maps %s to %s", (status, expected) => {
    expect(stepForStatus(status)).toBe(expected);
  });

  it("shows only a display claim from the active account token", () => {
    const payload = globalThis.btoa(JSON.stringify({ email: "student@example.test", sub: "internal-subject" }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(accountLabelFromIdToken(`header.${payload}.signature`)).toBe("student@example.test");
    expect(accountLabelFromIdToken("invalid")).toBeNull();
  });

  it("reads only the explicit lesson token from a URL fragment", () => {
    expect(lessonTokenFromHash("#token=shared-token&ignored=value")).toBe("shared-token");
    expect(lessonTokenFromHash("#ignored=value")).toBeNull();
    expect(lessonTokenFromHash("#token=%20%20")).toBeNull();
  });
});
