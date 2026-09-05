export type ImageAnnotationBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
  clipPath?: string;
};

/** The raster's full coordinate space and its visible intersection with the image content box. */
export function imageAnnotationGeometry(image: HTMLImageElement): {
  bounds: ImageAnnotationBounds;
  visibleBounds: ImageAnnotationBounds;
} | null {
  if (!image.naturalWidth || !image.naturalHeight) return null;
  const rect = image.getBoundingClientRect();
  const style = getComputedStyle(image);
  const pixels = (value: string) => Number.parseFloat(value) || 0;
  const leftInset = pixels(style.borderLeftWidth) + pixels(style.paddingLeft);
  const topInset = pixels(style.borderTopWidth) + pixels(style.paddingTop);
  const box = {
    left: rect.left + leftInset,
    top: rect.top + topInset,
    width: rect.width - leftInset - pixels(style.borderRightWidth) - pixels(style.paddingRight),
    height: rect.height - topInset - pixels(style.borderBottomWidth) - pixels(style.paddingBottom),
  };
  if (box.width <= 0 || box.height <= 0) return null;
  const contain = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
  let width = box.width;
  let height = box.height;
  if (style.objectFit && style.objectFit !== "fill") {
    const scale = style.objectFit === "cover"
      ? Math.max(box.width / image.naturalWidth, box.height / image.naturalHeight)
      : style.objectFit === "none" ? 1 : style.objectFit === "scale-down" ? Math.min(1, contain) : contain;
    width = image.naturalWidth * scale;
    height = image.naturalHeight * scale;
  }
  const [positionX = "50%", positionY = "50%"] = style.objectPosition.split(/\s+/).filter(Boolean);
  const offset = (position: string, freeSpace: number) => {
    if (position.endsWith("%")) return pixels(position) * freeSpace / 100;
    if (position === "center") return freeSpace / 2;
    if (position === "right" || position === "bottom") return freeSpace;
    return pixels(position);
  };
  const left = box.left + offset(positionX, box.width - width);
  const top = box.top + offset(positionY, box.height - height);
  const crop = {
    top: Math.max(0, box.top - top),
    right: Math.max(0, left + width - box.left - box.width),
    bottom: Math.max(0, top + height - box.top - box.height),
    left: Math.max(0, box.left - left),
  };
  return {
    bounds: {
      left, top, width, height,
      ...(Object.values(crop).some((value) => value > 0)
        ? { clipPath: `inset(${crop.top}px ${crop.right}px ${crop.bottom}px ${crop.left}px)` }
        : {}),
    },
    visibleBounds: {
      left: left + crop.left,
      top: top + crop.top,
      width: Math.max(0, width - crop.left - crop.right),
      height: Math.max(0, height - crop.top - crop.bottom),
    },
  };
}

/** Keep image loading/letterbox areas from accidentally creating legacy page annotations. */
export function isOverAnnotationImage(surface: HTMLElement | null, point: { clientX: number; clientY: number }): boolean {
  return Array.from(surface?.querySelectorAll<HTMLImageElement>("img[data-playsay-annotation-anchor-id]") ?? [])
    .some((image) => {
      const rect = image.getBoundingClientRect();
      return point.clientX >= rect.left && point.clientX <= rect.right
        && point.clientY >= rect.top && point.clientY <= rect.bottom;
    });
}
