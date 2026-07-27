// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaterialVideoSync } from "../../model/materialDocument";
import { YouTubeSyncedPlayer } from "./YouTubeSyncedPlayer";

vi.mock("../../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as Window & { YT?: unknown }).YT;
});

describe("YouTubeSyncedPlayer", () => {
  it("applies a late-join remote position without echo and publishes the next local action", async () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const seekTo = vi.fn();
    const playVideo = vi.fn();
    const pauseVideo = vi.fn();
    let playerState = 1;
    let stateChange: ((event: { data: number }) => void) | null = null;

    class Player {
      constructor(
        _element: HTMLIFrameElement,
        options: {
          events: {
            onReady: () => void;
            onStateChange: (event: { data: number }) => void;
          };
        },
      ) {
        stateChange = options.events.onStateChange;
        queueMicrotask(options.events.onReady);
      }

      destroy = vi.fn();
      getCurrentTime = () => 42;
      getPlayerState = () => playerState;
      pauseVideo = pauseVideo;
      playVideo = playVideo;
      seekTo = seekTo;
    }

    Object.defineProperty(window, "YT", {
      configurable: true,
      value: { Player },
    });
    const sync: MaterialVideoSync = {
      clientId: 1,
      publish,
      ready: true,
      states: {
        "video-1": {
          action: "play",
          blockId: "video-1",
          heartbeat: 0,
          playing: true,
          positionSeconds: 37,
          revision: 4,
          sourceClientId: 2,
        },
      },
    };

    render(
      <YouTubeSyncedPlayer
        allowFullscreen={false}
        blockId="video-1"
        src="https://www.youtube-nocookie.com/embed/abc123?rel=0"
        sync={sync}
        title="Shared video"
      />,
    );

    await act(async () => Promise.resolve());
    expect(seekTo).toHaveBeenCalledWith(37, true);
    expect(playVideo).toHaveBeenCalledOnce();

    act(() => stateChange?.({ data: 1 }));
    expect(publish).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
      playerState = 2;
      stateChange?.({ data: 2 });
    });
    expect(publish).toHaveBeenCalledWith("video-1", {
      action: "pause",
      playing: false,
      positionSeconds: 42,
    });
    expect(pauseVideo).not.toHaveBeenCalled();
  });
});
