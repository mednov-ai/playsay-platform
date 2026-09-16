import { describe, expect, it } from "vitest";
import { createExternalActivityDiagnostics } from "./externalActivityDiagnostics";

describe("external activity diagnostics", () => {
  it("persists only bounded failure metadata and aggregates successes", () => {
    let stored = "";
    const diagnostics = createExternalActivityDiagnostics({
      getItem: () => stored || null,
      setItem: (_key, value) => { stored = value; },
    });
    diagnostics.recordSuccess("dispatch", "local");
    diagnostics.recordFailure({
      timestamp: "2026-09-16T12:00:00.000Z",
      correlationId: "opaque-event",
      stage: "extension",
      transport: "local",
      result: "DEBUGGER_FAILED",
      providerUrl: "https://private.example",
      input: "secret",
      coordinates: [10, 20],
      lessonId: "lesson-private",
      token: "secret-token",
    } as never);

    expect(JSON.parse(stored)).toEqual([{
      timestamp: "2026-09-16T12:00:00.000Z",
      correlationId: "opaque-event",
      stage: "extension",
      transport: "local",
      result: "DEBUGGER_FAILED",
    }]);
    const exported = diagnostics.exportJson();
    expect(exported).toContain('"dispatch:local": 1');
    expect(exported).not.toContain("private.example");
    expect(exported).not.toContain("secret-token");
    expect(exported).not.toContain("lesson-private");
  });

  it("bounds the local failure ring", () => {
    const diagnostics = createExternalActivityDiagnostics(null);
    for (let index = 0; index < 60; index += 1) {
      diagnostics.recordFailure({
        timestamp: new Date(index).toISOString(),
        correlationId: `event-${index}`,
        stage: "acknowledgement",
        transport: "livekit",
        result: "ACK_TIMEOUT",
      });
    }
    expect(diagnostics.failures()).toHaveLength(50);
    expect(diagnostics.failures()[0]?.correlationId).toBe("event-10");
  });
});
