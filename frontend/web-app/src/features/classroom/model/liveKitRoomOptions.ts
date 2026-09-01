import {
  type RoomConnectOptions,
  type RoomOptions,
  VideoPresets,
} from "livekit-client";
import type { MediaRoutingResponse } from "../../../generated/playsay-api";

const lessonVideoMaxBitrate = 2_000_000;
const lessonVideoMaxFramerate = 30;

export function lessonLiveKitRoomOptions(
  audioOutputDeviceId: string,
): RoomOptions {
  return {
    adaptiveStream: true,
    audioOutput: {
      deviceId: audioOutputDeviceId,
    },
    dynacast: true,
    publishDefaults: {
      dtx: true,
      simulcast: true,
      videoCodec: "vp8",
      videoEncoding: {
        maxBitrate: lessonVideoMaxBitrate,
        maxFramerate: lessonVideoMaxFramerate,
      },
    },
    videoCaptureDefaults: {
      frameRate: lessonVideoMaxFramerate,
      resolution: VideoPresets.h720.resolution,
    },
  };
}

export function lessonLiveKitRoomConnectOptions(
  mediaRouting?: MediaRoutingResponse | null,
  nowMs = Date.now(),
): RoomConnectOptions {
  const rtcConfig = regionalRelayRtcConfiguration(mediaRouting, nowMs);
  return rtcConfig ? { rtcConfig } : {};
}

export function regionalRelayPolicyKey(mediaRouting?: MediaRoutingResponse | null): string {
  if (!mediaRouting) return "baseline";
  return `${mediaRouting.policy}:${mediaRouting.revision}:${mediaRouting.iceTransportPolicy}`;
}

export function liveKitRoomInstanceKey(
  roomName: string,
  tokenExpiresAt: string,
  serverUrl: string,
  mediaRouting?: MediaRoutingResponse | null,
): string {
  return `${roomName}:${tokenExpiresAt}:${serverUrl}:${regionalRelayPolicyKey(mediaRouting)}`;
}

function regionalRelayRtcConfiguration(
  mediaRouting: MediaRoutingResponse | null | undefined,
  nowMs: number,
): RTCConfiguration | undefined {
  if (!mediaRouting) return undefined;

  const expiresAtMs = Date.parse(mediaRouting.expiresAt);
  const supported = mediaRouting.policy === "REGIONAL_RELAY"
    && mediaRouting.revision === "selectel-rf-v1"
    && mediaRouting.iceTransportPolicy === "relay"
    && Number.isFinite(expiresAtMs)
    && expiresAtMs > nowMs
    && mediaRouting.iceServers.length > 0
    && mediaRouting.iceServers.every((server) => (
      server.urls.length > 0
      && server.username.length > 0
      && server.credential.length > 0
    ));

  if (!supported) {
    return { iceServers: [], iceTransportPolicy: "relay" };
  }

  return {
    iceTransportPolicy: "relay",
    iceServers: mediaRouting.iceServers.map((server) => ({
      credential: server.credential,
      urls: [...server.urls],
      username: server.username,
    })),
  };
}
