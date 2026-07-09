import { describe, expect, it } from "vitest";
import { studentInviteTokenFromLocation } from "./studentInviteToken";

describe("student invite token location parsing", () => {
  it("reads the one-time invite code from the URL fragment", () => {
    expect(studentInviteTokenFromLocation({ hash: "#A7K2Q9", search: "?token=legacy" })).toBe("A7K2Q9");
  });

  it("falls back to legacy query token links", () => {
    expect(studentInviteTokenFromLocation({ hash: "", search: "?token=legacy-token" })).toBe("legacy-token");
  });

  it("returns an empty token when the location has no invite secret", () => {
    expect(studentInviteTokenFromLocation({ hash: "", search: "" })).toBe("");
  });
});
