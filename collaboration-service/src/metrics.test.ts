import { describe, expect, it, vi } from "vitest";
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
      activeExternalActivityConnections: 0,
      activeRooms: 1,
      bufferedBytes: 0,
      gameBufferedBytes: 0,
      externalActivityBufferedBytes: 0,
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
      activeExternalActivityConnections: 0,
      activeRooms: 1,
      bufferedBytes: 0,
      gameBufferedBytes: 64,
      externalActivityBufferedBytes: 0,
    });

    expect(rendered).toContain("playsay_collaboration_game_active_connections 1");
    expect(rendered).toContain('playsay_collaboration_game_messages_total{message_type="2"} 1');
    expect(rendered).toContain("playsay_collaboration_game_bytes_total 256");
    expect(rendered).toContain("playsay_collaboration_game_websocket_buffered_bytes 64");
  });

  it("records fixed-cardinality external activity relay stages without identifiers", async () => {
    const metrics = new CollaborationMetrics();
    metrics.recordExternalActivityRelay("external-input", "accepted", 192, 0.0004);

    const rendered = await metrics.render({
      activeConnections: 2,
      activeGameConnections: 0,
      activeExternalActivityConnections: 2,
      activeRooms: 1,
      bufferedBytes: 96,
      gameBufferedBytes: 0,
      externalActivityBufferedBytes: 96,
    });

    expect(rendered).toContain("playsay_collaboration_external_activity_active_connections 2");
    expect(rendered).toContain('playsay_collaboration_external_activity_stage_total{stage="external-input",transport="fast-lane",result="accepted"} 1');
    expect(rendered).toContain("playsay_collaboration_external_activity_bytes_total 192");
    expect(rendered).not.toContain("eventId");
    expect(rendered).not.toContain("session-1");
  });

  it("writes failure-only records with an explicit privacy-safe schema", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const metrics = new CollaborationMetrics();
    metrics.recordExternalActivityFailure({
      correlationId: "opaque-event",
      result: "ACK_TIMEOUT",
      stage: "acknowledgement",
      timestamp: "2026-09-16T12:00:00.000Z",
      transport: "fast-lane",
    });
    const record = String(warn.mock.calls[0]?.[0]);
    expect(record).toContain("opaque-event");
    expect(record).toContain("ACK_TIMEOUT");
    expect(record).not.toContain("lessonId");
    expect(record).not.toContain("coordinates");
    expect(record).not.toContain("token");
    warn.mockRestore();
  });
});
