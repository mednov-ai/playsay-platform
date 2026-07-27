import { describe, expect, it } from "vitest";
import {
  realtimeReconnectDelayMs,
  realtimeReconnectMaxDelayMs,
} from "./realtimeLifecycle";

describe("lesson realtime reconnect policy", () => {
  it("backs off, caps the delay and applies bounded positive jitter", () => {
    expect(realtimeReconnectDelayMs(0, 0)).toBe(500);
    expect(realtimeReconnectDelayMs(1, 0)).toBe(1_000);
    expect(realtimeReconnectDelayMs(5, 0)).toBe(realtimeReconnectMaxDelayMs);
    expect(realtimeReconnectDelayMs(99, 1)).toBe(12_000);
  });
});
