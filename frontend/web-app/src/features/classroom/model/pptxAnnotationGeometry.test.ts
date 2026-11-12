import { describe, expect, it } from "vitest";
import { pptxAnnotationBaseline, pptxAnnotationGeometry, pptxSlideAnnotationGeometry } from "./pptxAnnotationGeometry";

describe("PPTX annotation geometry", () => {
  it("preserves existing unzoomed coordinates and follows the same slide point after zoom", () => {
    const stage = { left: 100, top: 100, width: 600, height: 450 };
    const slide = { left: 112, top: 112, width: 576, height: 432 };
    const baseline = pptxAnnotationBaseline(stage, slide, { left: 0, top: 0 });
    const original = pptxAnnotationGeometry(baseline, stage, slide)!;
    expect(original.bounds).toEqual(stage);
    const zoomedSlide = { ...slide, width: slide.width * 1.2, height: slide.height * 1.2 };
    const zoomed = pptxAnnotationGeometry(baseline, stage, zoomedSlide)!;
    const point = { x: 0.34, y: 0.37 };
    const relative = (bounds: typeof stage, content: typeof stage) => ({
      x: (bounds.left + bounds.width * point.x - content.left) / content.width,
      y: (bounds.top + bounds.height * point.y - content.top) / content.height,
    });
    expect(relative(zoomed.bounds, zoomedSlide).x).toBeCloseTo(relative(original.bounds, slide).x, 8);
    expect(relative(zoomed.bounds, zoomedSlide).y).toBeCloseTo(relative(original.bounds, slide).y, 8);
    expect(zoomed.bounds.clipPath).toBeDefined();
    expect(zoomed.visibleBounds).toEqual(stage);
  });

  it("keeps the anchor attached to a panned slide and clips it to the stage", () => {
    const stage = { left: 10, top: 20, width: 500, height: 400 };
    const slide = { left: 20, top: 30, width: 480, height: 360 };
    const baseline = pptxAnnotationBaseline(stage, slide, { left: 0, top: 0 });
    const panned = pptxAnnotationGeometry(baseline, stage, { ...slide, left: -30, top: 10 })!;
    expect(panned.bounds.left).toBe(-40);
    expect(panned.bounds.top).toBe(0);
    expect(panned.visibleBounds).toEqual({ left: 10, top: 20, width: 450, height: 380 });
    expect(panned.bounds.clipPath).toBe("inset(20px 0px 0px 50px)");
  });

  it("uses the slide itself as the new coordinate space and clips to both containers", () => {
    const slide = { left: 10, top: 20, width: 800, height: 600 };
    const stage = { left: 20, top: 30, width: 500, height: 400 };
    const viewport = { left: 40, top: 10, width: 400, height: 350 };
    const geometry = pptxSlideAnnotationGeometry(stage, viewport, slide)!;
    expect(geometry.bounds).toEqual({ ...slide, clipPath: "inset(10px 370px 260px 30px)" });
    expect(geometry.visibleBounds).toEqual({ left: 40, top: 30, width: 400, height: 330 });
  });
});
