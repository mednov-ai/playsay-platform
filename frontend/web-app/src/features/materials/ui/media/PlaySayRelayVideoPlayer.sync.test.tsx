// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MaterialVideoSync } from "../../model/materialDocument";
import { PlaySayRelayVideoPlayer } from "./PlaySayRelayVideoPlayer";

vi.mock("../../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PlaySayRelayVideoPlayer synchronized playback", () => {
  it("applies remote play and pause without publishing an echo", async () => {
    const publish = vi.fn();
    const sync = videoSync(publish, {
      action: "play",
      blockId: "video-1",
      heartbeat: 0,
      playing: true,
      positionSeconds: 18,
      revision: 1,
      sourceClientId: 2,
    });
    const view = render(
      <PlaySayRelayVideoPlayer
        blockId="video-1"
        src="/relay/video"
        sync={sync}
        title="Shared video"
      />,
    );

    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(publish).not.toHaveBeenCalled();

    view.rerender(
      <PlaySayRelayVideoPlayer
        blockId="video-1"
        src="/relay/video"
        sync={videoSync(publish, {
          ...sync.states["video-1"]!,
          action: "pause",
          playing: false,
          revision: 2,
        })}
        title="Shared video"
      />,
    );
    await waitFor(() => expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled());
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes a local play and exposes recovery when remote autoplay is rejected", async () => {
    const publish = vi.fn();
    const local = render(
      <PlaySayRelayVideoPlayer
        blockId="video-1"
        src="/relay/video"
        sync={videoSync(publish)}
        title="Shared video"
      />,
    );
    fireEvent.click(local.getByRole("button", { name: "materials.renderer.videoPlay" }));
    expect(publish).toHaveBeenCalledWith("video-1", {
      action: "play",
      playing: true,
      positionSeconds: 0,
    });
    local.unmount();

    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    const blocked = render(
      <PlaySayRelayVideoPlayer
        blockId="video-1"
        src="/relay/video"
        sync={videoSync(vi.fn(), {
          action: "play",
          blockId: "video-1",
          heartbeat: 0,
          playing: true,
          positionSeconds: 5,
          revision: 1,
          sourceClientId: 2,
        })}
        title="Shared video"
      />,
    );
    expect(await blocked.findByText("materials.renderer.videoSyncResume")).not.toBeNull();
  });
});

function videoSync(
  publish: MaterialVideoSync["publish"],
  state?: MaterialVideoSync["states"][string],
): MaterialVideoSync {
  return {
    clientId: 1,
    publish,
    ready: true,
    states: state ? { "video-1": state } : {},
  };
}
