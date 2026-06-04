import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  attachRelayVideoSourceForPlayback,
  isRetryableRelayPlayInterruption,
  PlaySayRelayVideoPlayer,
} from "./PlaySayRelayVideoPlayer";

describe("PlaySayRelayVideoPlayer", () => {
  it("does not attach the relay stream src before the learner presses play", () => {
    const markup = renderToStaticMarkup(createElement(PlaySayRelayVideoPlayer, {
      src: "/api/media/video-playback-sessions/session-1/stream",
      thumbnailUrl: "/api/materials/material-1/assets/asset-1/content",
      title: "Warm-up",
    }));

    expect(markup).toContain("playsay-relay-player");
    expect(markup).toContain("playsay-relay-player-poster");
    expect(markup).toContain("/api/materials/material-1/assets/asset-1/content");
    expect(markup).toContain("preload=\"none\"");
    expect(markup).toContain("playsinline=\"\"");
    expect(markup).not.toContain("playsay-relay-player-controls");
    expect(markup).not.toContain(">Warm-up<");
    expect(markup).not.toContain("src=\"/api/media/video-playback-sessions/session-1/stream\"");
  });

  it("attaches relay stream source imperatively for one-click playback", () => {
    const video: Parameters<typeof attachRelayVideoSourceForPlayback>[0] = {
      getAttribute: vi.fn(() => null),
      load: vi.fn(),
      preload: "none",
      setAttribute: vi.fn(),
    };

    attachRelayVideoSourceForPlayback(video, "/api/media/video-playback-sessions/session-1/stream");

    expect(video.setAttribute).toHaveBeenCalledWith("src", "/api/media/video-playback-sessions/session-1/stream");
    expect(video.preload).toBe("metadata");
    expect(video.load).toHaveBeenCalledTimes(1);
  });

  it("retries interrupted first play while media is still preparing", () => {
    expect(isRetryableRelayPlayInterruption({ name: "AbortError" }, { error: null, readyState: 0 })).toBe(true);
    expect(isRetryableRelayPlayInterruption({ name: "NotAllowedError" }, { error: null, readyState: 0 })).toBe(false);
  });
});
