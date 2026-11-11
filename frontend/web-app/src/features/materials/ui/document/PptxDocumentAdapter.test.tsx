// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PptxDocumentAdapter from "./PptxDocumentAdapter";

const state = vi.hoisted(() => ({ slides: 0 }));
vi.mock("pptx-react-viewer", async () => {
  const React = await import("react");
  return {
    PowerPointViewer: React.forwardRef((_props, ref) => {
      React.useImperativeHandle(ref, () => ({
        getSlideCount: () => state.slides,
        goTo: () => undefined,
        setMode: () => undefined,
        setZoom: () => undefined,
      }));
      return <div>synthetic viewer</div>;
    }),
  };
});

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("PowerPoint viewer recovery", () => {
  it.each([[0, true], [2, false]])("reports a persistent zero-slide viewer after the load limit (slides=%i)", async (slides, failed) => {
    vi.useFakeTimers();
    state.slides = slides;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))));
    const onError = vi.fn();
    render(<PptxDocumentAdapter fileName="fixture" onError={onError} onPageIndexChange={vi.fn()} pageIndex={0} src="blob:fixture" zoom={1} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText("synthetic viewer")).toBeTruthy();
    act(() => vi.advanceTimersByTime(60_000));
    expect(onError).toHaveBeenCalledTimes(failed ? 1 : 0);
  });
});
