import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlaySayRelayVideoPlayer } from "./PlaySayRelayVideoPlayer";

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
});
