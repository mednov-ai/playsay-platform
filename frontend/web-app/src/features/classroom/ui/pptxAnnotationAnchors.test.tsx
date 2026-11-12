// @vitest-environment jsdom
import { useRef } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAnnotationAnchors } from "./LessonTaskCanvas";

vi.mock("../../../shared/i18n", () => ({ i18n: { t: (key: string) => key }, useAppTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => vi.restoreAllMocks());

function Fixture({ zoom }: { zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const anchors = useAnnotationAnchors(ref, "page", "default");
  return <div ref={ref} data-testid="surface">
    <div className="playsay-document-viewer" data-format="PPTX">
      <div className="playsay-document-stage" data-playsay-annotation-anchor-id="doc:revision:0" data-playsay-document-zoom={zoom}>
        <div className="playsay-pptx-static-viewer"><div data-pptx-viewport="true">
          <div aria-roledescription="slide" style={{ transform: `scale(${zoom})` }} />
        </div></div>
      </div>
    </div>
    <output>{JSON.stringify(anchors)}</output>
  </div>;
}

describe("PPTX annotation anchor lifecycle", () => {
  it("remeasures the existing anchor on zoom and pan without changing its identity", async () => {
    let scale = 1;
    let scrollLeft = 0;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("playsay-document-stage")) return new DOMRect(100, 100, 600, 450);
      if (this.getAttribute("aria-roledescription") === "slide") return new DOMRect(112 - scrollLeft, 112, 576 * scale, 432 * scale);
      return new DOMRect(0, 0, 1000, 1000);
    });
    const view = render(<Fixture zoom={1} />);
    const viewport = view.container.querySelector<HTMLElement>("[data-pptx-viewport]")!;
    Object.defineProperty(viewport, "scrollLeft", { configurable: true, get: () => scrollLeft });
    const anchors = () => JSON.parse(view.container.querySelector("output")!.textContent!);
    const current = () => anchors().find((anchor: { geometry: string }) => anchor.geometry === "pptx-legacy");
    const slide = () => anchors().find((anchor: { geometry: string }) => anchor.geometry === "pptx-slide");
    await waitFor(() => expect(current()?.bounds).toEqual({ left: 100, top: 100, width: 600, height: 450 }));
    expect(slide().bounds).toEqual({ left: 112, top: 112, width: 576, height: 432 });
    expect(slide().id).toBe(current().id);
    scale = 1.2;
    view.rerender(<Fixture zoom={1.2} />);
    await waitFor(() => expect(current().bounds.width).toBeCloseTo(720));
    expect(current().id).toBe("doc:revision:0");
    expect(current().bounds.left).toBeCloseTo(97.6);
    expect(current().bounds.clipPath).toBeDefined();
    expect(slide().bounds.width).toBeCloseTo(691.2);
    expect(slide().bounds.clipPath).toBeDefined();
    scrollLeft = 50;
    fireEvent.scroll(viewport);
    await waitFor(() => expect(current().bounds.left).toBeCloseTo(47.6));
    expect(slide().bounds.left).toBeCloseTo(62);
    expect(current().id).toBe("doc:revision:0");
  });
});
