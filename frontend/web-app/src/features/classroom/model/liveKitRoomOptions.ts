import {
  type RoomOptions,
  VideoPresets,
} from "livekit-client";

const lessonVideoMaxBitrate = 2_000_000;
const lessonVideoMaxFramerate = 30;

export function lessonLiveKitRoomOptions(audioOutputDeviceId: string): RoomOptions {
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
