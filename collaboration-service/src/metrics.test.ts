import { describe, expect, it } from "vitest";
import { CollaborationMetrics } from "./metrics.js";

describe("CollaborationMetrics", () => {
  it("records bounded ephemeral relay volume without payload labels", async () => {
    const metrics = new CollaborationMetrics();

    metrics.recordEphemeralRelay(128, 0.001);
    metrics.recordConnectionOpened("yjs");
    metrics.recordHeartbeatTermination("yjs");
    metrics.recordConnectionClosed("yjs", "heartbeat", 45);
    const rendered = await metrics.render({
      activeConnections: 2,
      activeGameConnections: 0,
      activeRooms: 1,
      bufferedBytes: 0,
      gameBufferedBytes: 0,
    });

    expect(rendered).toContain("playsay_collaboration_ephemeral_messages_total 1");
    expect(rendered).toContain("playsay_collaboration_ephemeral_bytes_total 128");
    expect(rendered).toContain("playsay_collaboration_ephemeral_relay_duration_seconds_count 1");
    expect(rendered).toContain('playsay_collaboration_connection_opens_total{channel="yjs"} 1');
    expect(rendered).toContain('playsay_collaboration_heartbeat_terminations_total{channel="yjs"} 1');
    expect(rendered).toContain('playsay_collaboration_connection_closes_total{channel="yjs",close_class="heartbeat"} 1');
    expect(rendered).toContain('playsay_collaboration_channel_active_connections{channel="yjs"} 2');
  });

  it("records low-latency game relay metrics without event identifiers", async () => {
    const metrics = new CollaborationMetrics();
    metrics.recordGameRelay(2, 256, 0.0005);

    const rendered = await metrics.render({
      activeConnections: 2,
      activeGameConnections: 1,
      activeRooms: 1,
      bufferedBytes: 0,
      gameBufferedBytes: 64,
    });

    expect(rendered).toContain("playsay_collaboration_game_active_connections 1");
    expect(rendered).toContain('playsay_collaboration_game_messages_total{message_type="2"} 1');
    expect(rendered).toContain("playsay_collaboration_game_bytes_total 256");
    expect(rendered).toContain("playsay_collaboration_game_websocket_buffered_bytes 64");
  });
});
