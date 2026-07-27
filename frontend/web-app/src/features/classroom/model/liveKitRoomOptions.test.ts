import { VideoPresets } from "livekit-client";
import { describe, expect, it } from "vitest";
import { lessonLiveKitRoomOptions } from "./liveKitRoomOptions";

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
});
