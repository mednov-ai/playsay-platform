import { describe, expect, it } from "vitest";
import { studentInviteTokenFromLocation, subscribeToStudentInviteToken } from "./studentInviteToken";

describe("student invite token location parsing", () => {
  it("reads the one-time invite code from the URL fragment", () => {
    expect(studentInviteTokenFromLocation({ hash: "#A7K2Q9", search: "?token=legacy" })).toBe("A7K2Q9");
  });

  it("ignores legacy query token links", () => {
    expect(studentInviteTokenFromLocation({ hash: "", search: "?token=legacy-token" })).toBe("");
  });

  it("returns an empty token when the location has no invite secret", () => {
    expect(studentInviteTokenFromLocation({ hash: "", search: "" })).toBe("");
  });

  it("reads a replacement code when the browser reuses the join page", () => {
    const listeners = new Set<() => void>();
    const source = {
      location: { hash: "", search: "" },
      addEventListener: (_type: "hashchange", listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: "hashchange", listener: () => void) => listeners.delete(listener),
    };
    const received: string[] = [];
    const unsubscribe = subscribeToStudentInviteToken(source, (token) => received.push(token));

    source.location.hash = "#B8M3R7";
    listeners.forEach((listener) => listener());

    expect(received).toEqual(["B8M3R7"]);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
