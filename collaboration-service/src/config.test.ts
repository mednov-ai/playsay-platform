import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const requiredEnv = {
  COLLABORATION_SERVICE_TOKEN: "service-token",
  COLLABORATION_TOKEN_SECRET: "01234567890123456789012345678901",
  PLAYSAY_API_BASE_URL: "https://api.example.test",
};

describe("loadConfig", () => {
  it("uses the production-safe websocket backpressure defaults", () => {
    expect(loadConfig(requiredEnv)).toMatchObject({
      websocketHardLimitBytes: 4 * 1024 * 1024,
      websocketMaxPayloadBytes: 4 * 1024 * 1024,
      websocketSoftLimitBytes: 1024 * 1024,
    });
  });

  it("rejects a hard limit that does not exceed the soft limit", () => {
    expect(() => loadConfig({
      ...requiredEnv,
      WEBSOCKET_HARD_LIMIT_BYTES: "1024",
      WEBSOCKET_SOFT_LIMIT_BYTES: "1024",
    })).toThrow(/hard limit/);
  });
});
