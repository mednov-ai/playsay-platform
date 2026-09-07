// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as api from "../../../../shared/api/playsay";
import { i18n } from "../../../../shared/i18n";
import { RenderedMaterialBlock } from "./RenderedMaterialBlock";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

const block = { id: "video-1", type: "videoEmbed" as const, title: "Video", provider: "YOUTUBE", url: "https://youtu.be/5l-fo-d0gt8" };
const missing: api.MaterialVideoPlayback = { materialId: "material-1", blockId: block.id, mode: "EMBED", reason: "YOUTUBE_METADATA_MISSING", embedUrl: "https://www.youtube-nocookie.com/embed/5l-fo-d0gt8?rel=0" };
const props = { block, materialId: "material-1", assetTags: {}, assetUrls: {} };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeAll(() => i18n.changeLanguage("ru"));

describe("YouTube recovery decisions", () => {
  it("keeps student recovery read only and lets a failed request retry", async () => {
    const request = vi.spyOn(api, "createMaterialVideoPlayback").mockResolvedValueOnce({ ...missing, mode: "BLOCKED", reason: "YOUTUBE_RELAY_UNAVAILABLE" }).mockResolvedValue(missing);
    const edit = vi.fn();
    render(<RenderedMaterialBlock {...props} mode="classroom" onVideoMetadataEdit={edit} />);
    fireEvent.click(await screen.findByRole("button", { name: "Повторить загрузку" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Указать длительность" })).not.toBeInTheDocument();
    expect(edit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTitle("Video")).toHaveAttribute("src", missing.embedUrl));
  });

  it("ignores a late decision for the previous URL", async () => {
    let finishOld!: (value: api.MaterialVideoPlayback) => void;
    const old = new Promise<api.MaterialVideoPlayback>((resolve) => { finishOld = resolve; });
    const request = vi.spyOn(api, "createMaterialVideoPlayback").mockReturnValueOnce(old).mockResolvedValue({ ...missing, embedUrl: "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0" });
    const view = render(<RenderedMaterialBlock {...props} mode="teacherPreview" />);
    view.rerender(<RenderedMaterialBlock {...props} block={{ ...block, url: "https://youtu.be/abcdefghijk" }} mode="teacherPreview" />);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await act(async () => finishOld({ ...missing, mode: "BLOCKED", reason: "YOUTUBE_DURATION_TOO_LONG" }));
    expect(screen.getByTitle("Video")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0");
    expect(screen.queryByText("YOUTUBE_DURATION_TOO_LONG")).not.toBeInTheDocument();
  });
});
