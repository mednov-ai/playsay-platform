import { describe, expect, it } from "vitest";
import type { MaterialEditorBlock } from "../../model/materialDocument";
import { materialVideoEmbedFrame } from "./videoEmbed";

const youtubeBlock: MaterialEditorBlock = {
  id: "video-1",
  provider: "YOUTUBE",
  title: "Warm-up",
  type: "videoEmbed",
  url: "https://www.youtube.com/watch?v=5l-fo-d0gt8",
};

describe("materialVideoEmbedFrame", () => {
  it("uses rf relay decision when backend returns a relay url", () => {
    const frame = materialVideoEmbedFrame(youtubeBlock, {
      mode: "RF_RELAY",
      relayUrl: "/api/materials/video-playback-sessions/session-1/stream",
    });

    expect(frame).toEqual({
      kind: "RF_RELAY",
      src: "/api/materials/video-playback-sessions/session-1/stream",
      title: "Warm-up",
    });
  });

  it("uses backend embed url when relay is not selected", () => {
    const frame = materialVideoEmbedFrame(youtubeBlock, {
      embedUrl: "https://www.youtube-nocookie.com/embed/5l-fo-d0gt8?rel=0",
      mode: "EMBED",
    });

    expect(frame).toEqual({
      kind: "EMBED",
      src: "https://www.youtube-nocookie.com/embed/5l-fo-d0gt8?rel=0",
      title: "Warm-up",
    });
  });
});
