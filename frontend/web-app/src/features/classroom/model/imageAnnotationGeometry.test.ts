// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { imageAnnotationGeometry } from "./imageAnnotationGeometry";

function image(fit = "contain", position = "50% 50%") {
  const node = document.createElement("img");
  Object.defineProperties(node, { naturalWidth: { value: 600 }, naturalHeight: { value: 1200 } });
  node.style.objectFit = fit;
  node.style.objectPosition = position;
  node.style.border = "2px solid black";
  node.getBoundingClientRect = () => new DOMRect(10, 20, 804, 404);
  return node;
}

describe("image annotation geometry", () => {
  it("excludes letterboxing and borders from image coordinates", () => {
    expect(imageAnnotationGeometry(image())).toEqual({
      bounds: { left: 312, top: 22, width: 200, height: 400 },
      visibleBounds: { left: 312, top: 22, width: 200, height: 400 },
    });
  });
  it("retains full raster coordinates and clips an authored cover preview", () => {
    expect(imageAnnotationGeometry(image("cover"))).toEqual({
      bounds: { left: 12, top: -578, width: 800, height: 1600, clipPath: "inset(600px 0px 600px 0px)" },
      visibleBounds: { left: 12, top: 22, width: 800, height: 400 },
    });
  });
  it("respects non-centered object positioning and padding", () => {
    const node = image("contain", "100% 0%");
    node.style.padding = "10px";
    expect(imageAnnotationGeometry(node)?.bounds).toEqual({ left: 612, top: 32, width: 190, height: 380 });
  });
  it("waits for intrinsic dimensions", () => {
    const node = document.createElement("img");
    node.getBoundingClientRect = () => new DOMRect(10, 20, 800, 400);
    expect(imageAnnotationGeometry(node)).toBeNull();
  });
  it("ignores a collapsed image even when it is already loaded", () => {
    const node = image();
    node.getBoundingClientRect = () => new DOMRect();
    expect(imageAnnotationGeometry(node)).toBeNull();
  });
});
