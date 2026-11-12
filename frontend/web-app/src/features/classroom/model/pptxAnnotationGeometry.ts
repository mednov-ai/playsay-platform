export type PptxAnnotationRect = { left: number; top: number; width: number; height: number };

export type PptxAnnotationBaseline = {
  slideWidth: number;
  slideHeight: number;
  stageWidth: number;
  stageHeight: number;
  stageOffsetX: number;
  stageOffsetY: number;
};

/** Preserve the existing stage-normalized coordinates at the unzoomed view. */
export function pptxAnnotationBaseline(
  stage: PptxAnnotationRect,
  slide: PptxAnnotationRect,
  scroll: { left: number; top: number },
): PptxAnnotationBaseline {
  return {
    slideWidth: slide.width,
    slideHeight: slide.height,
    stageWidth: stage.width,
    stageHeight: stage.height,
    stageOffsetX: stage.left - slide.left - scroll.left,
    stageOffsetY: stage.top - slide.top - scroll.top,
  };
}

/** Follow the actual slide scale and pan while keeping the existing anchor identity. */
export function pptxAnnotationGeometry(
  baseline: PptxAnnotationBaseline,
  stage: PptxAnnotationRect,
  slide: PptxAnnotationRect,
): { bounds: PptxAnnotationRect & { clipPath?: string }; visibleBounds: PptxAnnotationRect } | null {
  if (baseline.slideWidth <= 0 || baseline.slideHeight <= 0 || slide.width <= 0 || slide.height <= 0) return null;
  const scaleX = slide.width / baseline.slideWidth;
  const scaleY = slide.height / baseline.slideHeight;
  const bounds = {
    left: slide.left + baseline.stageOffsetX * scaleX,
    top: slide.top + baseline.stageOffsetY * scaleY,
    width: baseline.stageWidth * scaleX,
    height: baseline.stageHeight * scaleY,
  };
  return clipPptxAnnotationBounds(bounds, stage);
}

/** New slide-relative annotations share one coordinate space across viewports. */
export function pptxSlideAnnotationGeometry(
  stage: PptxAnnotationRect,
  viewport: PptxAnnotationRect,
  slide: PptxAnnotationRect,
): { bounds: PptxAnnotationRect & { clipPath?: string }; visibleBounds: PptxAnnotationRect } | null {
  if (slide.width <= 0 || slide.height <= 0) return null;
  const clip = {
    left: Math.max(stage.left, viewport.left),
    top: Math.max(stage.top, viewport.top),
    width: Math.max(0, Math.min(stage.left + stage.width, viewport.left + viewport.width) - Math.max(stage.left, viewport.left)),
    height: Math.max(0, Math.min(stage.top + stage.height, viewport.top + viewport.height) - Math.max(stage.top, viewport.top)),
  };
  return clipPptxAnnotationBounds(slide, clip);
}

function clipPptxAnnotationBounds(bounds: PptxAnnotationRect, clip: PptxAnnotationRect) {
  const left = Math.max(bounds.left, clip.left);
  const top = Math.max(bounds.top, clip.top);
  const right = Math.min(bounds.left + bounds.width, clip.left + clip.width);
  const bottom = Math.min(bounds.top + bounds.height, clip.top + clip.height);
  const visibleBounds = { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  const crop = {
    top: Math.max(0, top - bounds.top),
    right: Math.max(0, bounds.left + bounds.width - right),
    bottom: Math.max(0, bounds.top + bounds.height - bottom),
    left: Math.max(0, left - bounds.left),
  };
  return {
    bounds: {
      left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height,
      ...(Object.values(crop).some(value => value > 0.01)
        ? { clipPath: `inset(${crop.top}px ${crop.right}px ${crop.bottom}px ${crop.left}px)` } : {}),
    },
    visibleBounds,
  };
}
