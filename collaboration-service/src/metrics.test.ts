import { describe, expect, it } from "vitest";
import { CollaborationMetrics } from "./metrics.js";

describe("CollaborationMetrics", () => {
  it("records bounded ephemeral relay volume without payload labels", async () => {
    const metrics = new CollaborationMetrics();

    metrics.recordEphemeralRelay(128, 0.001);
    const rendered = await metrics.render({
      activeConnections: 2,
      activeRooms: 1,
      bufferedBytes: 0,
    });

    expect(rendered).toContain("playsay_collaboration_ephemeral_messages_total 1");
    expect(rendered).toContain("playsay_collaboration_ephemeral_bytes_total 128");
    expect(rendered).toContain("playsay_collaboration_ephemeral_relay_duration_seconds_count 1");
  });
});
