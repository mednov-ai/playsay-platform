// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }
import { useRef } from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAnnotationAnchors, type LessonPresentationMode } from "./LessonTaskCanvas";

function Fixture({ mode = "default", focused = "a" }: { mode?: LessonPresentationMode; focused?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const anchors = useAnnotationAnchors(ref, "page", mode);
  return <div ref={ref}>
    <img data-playsay-annotation-anchor-id="a" style={{ objectFit: "contain", objectPosition: "50% 50%" }} />
    <div className="playsay-material-focus-stack" data-active={mode === "image-focus"}>
      {mode === "image-focus" ? <img data-playsay-annotation-anchor-id={focused} style={{ objectFit: "contain", objectPosition: "50% 50%" }} /> : null}
    </div>
    <output>{JSON.stringify(anchors)}</output>
  </div>;
}

vi.mock("../../../shared/i18n", () => ({ i18n: { t: (key: string) => key }, useAppTranslation: () => ({ t: (key: string) => key }) }));

afterEach(() => vi.restoreAllMocks());

describe("image anchor lifecycle", () => {
  it("waits for load, measures raster bounds and remeasures on image replacement without resize", async () => {
    let naturalWidth = 0;
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockImplementation(() => naturalWidth);
    vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(1200);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return this instanceof HTMLImageElement ? new DOMRect(10, 20, 800, 400) : new DOMRect(0, 0, 1000, 1000);
    });
    const { container, rerender } = render(<Fixture />);
    expect(container.querySelector('output')!.textContent).toBe('[]');
    naturalWidth = 600;
    fireEvent.load(container.querySelector('img')!);
    await waitFor(() => expect(container.querySelector('output')!.textContent).toContain('"left":310'));
    naturalWidth = 1200;
    fireEvent.load(container.querySelector('img')!);
    await waitFor(() => expect(container.querySelector('output')!.textContent).toContain('"left":210'));
    rerender(<Fixture mode="image-focus" />);
    await waitFor(() => expect(JSON.parse(container.querySelector('output')!.textContent!)).toHaveLength(1));
    rerender(<Fixture mode="image-focus" focused="b" />);
    await waitFor(() => expect(JSON.parse(container.querySelector('output')!.textContent!)[0].id).toBe('b'));
    rerender(<Fixture />);
    await waitFor(() => expect(JSON.parse(container.querySelector('output')!.textContent!)[0].id).toBe('a'));
  });

  it("cancels queued measurements when the surface unmounts", () => {
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const { container, unmount } = render(<Fixture />);
    act(() => fireEvent.load(container.querySelector('img')!));
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
