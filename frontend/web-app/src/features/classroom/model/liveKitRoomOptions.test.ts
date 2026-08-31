import { VideoPresets } from "livekit-client";
import { describe, expect, it } from "vitest";
import type { MediaRoutingResponse } from "../../../generated/playsay-api";
import { lessonLiveKitRoomConnectOptions, lessonLiveKitRoomOptions, liveKitRoomInstanceKey, regionalRelayPolicyKey } from "./liveKitRoomOptions";

const routing: MediaRoutingResponse = {
  policy: "REGIONAL_RELAY",
  revision: "selectel-rf-v1",
  iceTransportPolicy: "relay",
  expiresAt: "2026-08-31T10:15:00Z",
  iceServers: [{
    urls: [
      "turn:turn.honeyschool.ru:3478?transport=udp",
      "turn:turn.honeyschool.ru:3478?transport=tcp",
      "turns:turn.honeyschool.ru:5349?transport=tcp",
    ],
    username: "1788171300:opaque",
    credential: "short-lived",
  }],
};

describe("lessonLiveKitRoomOptions", () => {
  it("pins the 100-lesson media profile and enables adaptive publishing", () => {
    expect(lessonLiveKitRoomOptions("speaker-1")).toEqual({
      adaptiveStream: true,
      audioOutput: {
        deviceId: "speaker-1",
      },
      dynacast: true,
      publishDefaults: {
        dtx: true,
        simulcast: true,
        videoCodec: "vp8",
        videoEncoding: {
          maxBitrate: 2_000_000,
          maxFramerate: 30,
        },
      },
      videoCaptureDefaults: {
        frameRate: 30,
        resolution: VideoPresets.h720.resolution,
      },
    });
  });

  it("passes an unexpired server-authored regional relay through rtcConfig", () => {
    expect(lessonLiveKitRoomConnectOptions(routing, Date.parse("2026-08-31T10:00:00Z")).rtcConfig).toEqual({
      iceTransportPolicy: "relay",
      iceServers: routing.iceServers,
    });
    expect(regionalRelayPolicyKey(routing)).toBe("REGIONAL_RELAY:selectel-rf-v1:relay");
  });

  it("fails closed for expired or unsupported routing without affecting a missing legacy response", () => {
    expect(lessonLiveKitRoomConnectOptions(undefined, Date.parse("2026-08-31T10:00:00Z")).rtcConfig).toBeUndefined();
    expect(lessonLiveKitRoomConnectOptions(routing, Date.parse("2026-08-31T10:16:00Z")).rtcConfig).toEqual({
      iceServers: [],
      iceTransportPolicy: "relay",
    });
    const unsupported = { ...routing, policy: "UNSUPPORTED" } as unknown as MediaRoutingResponse;
    expect(lessonLiveKitRoomConnectOptions(unsupported, Date.parse("2026-08-31T10:00:00Z")).rtcConfig).toEqual({
      iceServers: [],
      iceTransportPolicy: "relay",
    });
  });

  it("replaces the room instance for a fresh-token retry or routing-policy change", () => {
    const baseline = liveKitRoomInstanceKey("lesson-1", "2026-08-31T10:15:00Z");
    const freshToken = liveKitRoomInstanceKey("lesson-1", "2026-08-31T10:16:00Z");
    const regional = liveKitRoomInstanceKey("lesson-1", "2026-08-31T10:16:00Z", routing);

    expect(freshToken).not.toBe(baseline);
    expect(regional).not.toBe(freshToken);
    expect(regional).not.toContain(routing.iceServers[0].credential);
  });
});
