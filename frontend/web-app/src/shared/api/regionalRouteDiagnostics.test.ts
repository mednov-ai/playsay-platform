// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRegionalRouteDiagnostics, reportRegionalRouteDiagnostic, type RegionalRouteDiagnosticEvent } from "./regionalRouteDiagnostics";

vi.mock("./auth", () => ({ readTokens: () => null }));
const key = "honey-school:regional-route-diagnostics";
const event: RegionalRouteDiagnosticEvent = {
  attemptId: "11111111-1111-4111-8111-111111111111", stage: "ICE", outcome: "SUCCESS",
  connectionRole: "SUBSCRIBER", regionalEndpointMatched: null, transportClass: "UNKNOWN",
};

beforeEach(() => sessionStorage.clear());
describe("local route diagnostics", () => {
  it("keeps bounded evidence without authentication or telemetry", async () => {
    for (let i = 0; i < 60; i++) await reportRegionalRouteDiagnostic(event);
    expect(readRegionalRouteDiagnostics()).toHaveLength(50);
  });
  it("strips unexpected fields before storage and never returns expired evidence", async () => {
    await reportRegionalRouteDiagnostic({ ...event, token: "synthetic-secret" } as RegionalRouteDiagnosticEvent);
    expect(sessionStorage.getItem(key)).not.toContain("synthetic-secret");
    sessionStorage.setItem(key, JSON.stringify([
      { ...event, recordedAt: Date.now() - 15 * 60 * 1000 },
      { ...event, recordedAt: Date.now() + 10000 },
      { ...event, recordedAt: Date.now(), url: "synthetic-url" },
    ]));
    expect(readRegionalRouteDiagnostics()).toHaveLength(1);
    expect(readRegionalRouteDiagnostics()[0]).not.toHaveProperty("url");
  });
  it("ignores malformed and oversized storage", () => {
    for (const value of ["{", JSON.stringify({ token: "synthetic" }), "x".repeat(64001)]) {
      sessionStorage.setItem(key, value);
      expect(readRegionalRouteDiagnostics()).toEqual([]);
    }
  });
});
