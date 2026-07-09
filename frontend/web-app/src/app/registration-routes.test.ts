import { describe, expect, it } from "vitest";
import { isStudentInvitePath, registrationRouteFromPath } from "./routes";

describe("registration routes", () => {
  it("recognizes public registration pages", () => {
    expect(registrationRouteFromPath("/register")).toEqual({ kind: "start" });
    expect(registrationRouteFromPath("/register/check-email")).toEqual({ kind: "check-email" });
    expect(registrationRouteFromPath("/register/confirm")).toEqual({ kind: "confirm" });
    expect(registrationRouteFromPath("/forgot-password")).toEqual({ kind: "forgot-password" });
    expect(registrationRouteFromPath("/reset-password")).toEqual({ kind: "reset-password" });
  });

  it("recognizes managed student invite pages", () => {
    expect(isStudentInvitePath("/student-invite")).toBe(true);
    expect(isStudentInvitePath("/student-invite/")).toBe(true);
    expect(isStudentInvitePath("/register")).toBe(false);
  });
});
