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

  it("does not silently fall back to youtube embed when backend marks playback unavailable", () => {
    const frame = materialVideoEmbedFrame(youtubeBlock, {
      embedUrl: "https://www.youtube-nocookie.com/embed/5l-fo-d0gt8?rel=0",
      mode: "NEEDS_REVIEW",
      reason: "YOUTUBE_METADATA_MISSING",
    });

    expect(frame).toEqual({
      kind: "UNAVAILABLE",
      mode: "NEEDS_REVIEW",
      reason: "YOUTUBE_METADATA_MISSING",
      src: "",
      title: "Warm-up",
    });
  });

  it("keeps protected playback loading separate from unavailable errors", () => {
    const frame = materialVideoEmbedFrame(youtubeBlock, {
      mode: "NEEDS_REVIEW",
      reason: "VIDEO_PLAYBACK_LOADING",
    });

    expect(frame).toEqual({
      kind: "PENDING",
      mode: "NEEDS_REVIEW",
      reason: "VIDEO_PLAYBACK_LOADING",
      src: "",
      title: "Warm-up",
    });
  });

  it("applies teacher-selected clip bounds to youtube embed fallback urls", () => {
    const frame = materialVideoEmbedFrame({
      ...youtubeBlock,
      url: "https://youtu.be/5l-fo-d0gt8?t=8",
      videoClip: {
        startSeconds: 12,
        endSeconds: 45,
      },
    }, null);

    expect(frame?.src).toBe("https://www.youtube-nocookie.com/embed/5l-fo-d0gt8?rel=0&start=12&end=45");
  });
});
