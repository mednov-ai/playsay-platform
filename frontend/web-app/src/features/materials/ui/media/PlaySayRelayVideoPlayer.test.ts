import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlaySayRelayVideoPlayer } from "./PlaySayRelayVideoPlayer";

describe("PlaySayRelayVideoPlayer", () => {
  it("does not attach the relay stream src before the learner presses play", () => {
    const markup = renderToStaticMarkup(createElement(PlaySayRelayVideoPlayer, {
      src: "/api/materials/video-playback-sessions/session-1/stream",
      title: "Warm-up",
    }));

    expect(markup).toContain("playsay-relay-player");
    expect(markup).toContain("playsay-relay-player-poster");
    expect(markup).toContain("preload=\"none\"");
    expect(markup).toContain("playsinline=\"\"");
    expect(markup).not.toContain("playsay-relay-player-controls");
    expect(markup).not.toContain("src=\"/api/materials/video-playback-sessions/session-1/stream\"");
  });
});
