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
      gameRealtimeMode: "off",
      websocketHardLimitBytes: 4 * 1024 * 1024,
      websocketMaxPayloadBytes: 4 * 1024 * 1024,
      websocketSoftLimitBytes: 1024 * 1024,
      websocketHeartbeatIntervalMs: 20_000,
      websocketHeartbeatMissedPongs: 2,
    });
  });

  it("accepts only explicit game realtime rollout modes", () => {
    expect(loadConfig({ ...requiredEnv, GAME_REALTIME_MODE: "shadow" }).gameRealtimeMode)
      .toBe("shadow");
    expect(loadConfig({ ...requiredEnv, GAME_REALTIME_MODE: "primary" }).gameRealtimeMode)
      .toBe("primary");
    expect(() => loadConfig({ ...requiredEnv, GAME_REALTIME_MODE: "invalid" }))
      .toThrow(/GAME_REALTIME_MODE/);
  });

  it("rejects a hard limit that does not exceed the soft limit", () => {
    expect(() => loadConfig({
      ...requiredEnv,
      WEBSOCKET_HARD_LIMIT_BYTES: "1024",
      WEBSOCKET_SOFT_LIMIT_BYTES: "1024",
    })).toThrow(/hard limit/);
  });

  it("bounds stale websocket cleanup to sixty seconds", () => {
    expect(() => loadConfig({
      ...requiredEnv,
      WEBSOCKET_HEARTBEAT_INTERVAL_MS: "30000",
      WEBSOCKET_HEARTBEAT_MISSED_PONGS: "2",
    })).toThrow(/within 60 seconds/);
    expect(() => loadConfig({
      ...requiredEnv,
      WEBSOCKET_HEARTBEAT_MISSED_PONGS: "1.5",
    })).toThrow(/invalid integer/);
    expect(() => loadConfig({
      ...requiredEnv,
      WEBSOCKET_HEARTBEAT_MISSED_PONGS: "1",
    })).toThrow(/more than one missed pong/);
  });
});
