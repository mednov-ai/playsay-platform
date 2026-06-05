import { describe, expect, it } from "vitest";
import { registrationRouteFromPath } from "./routes";

describe("registration routes", () => {
  it("recognizes public registration pages", () => {
    expect(registrationRouteFromPath("/register")).toEqual({ kind: "start" });
    expect(registrationRouteFromPath("/register/check-email")).toEqual({ kind: "check-email" });
    expect(registrationRouteFromPath("/register/confirm")).toEqual({ kind: "confirm" });
  });
});
