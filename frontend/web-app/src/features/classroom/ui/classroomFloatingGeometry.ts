export type FloatingCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type FloatingBounds = { left: number; top: number; width: number; height: number };
export type FloatingPosition = { left: number; top: number };

export const FLOATING_ASPECT = 16 / 9;
export const FLOATING_INSET = 12;
export const FLOATING_MIN_WIDTH = 160;
export const FLOATING_MAX_WIDTH = 360;
export const FLOATING_DEFAULT_WIDTH = 224;

export function floatingWidth(requested: number, bounds: FloatingBounds): number {
  const maxWidth = Math.max(0, Math.min(FLOATING_MAX_WIDTH, bounds.width - FLOATING_INSET * 2, (bounds.height - FLOATING_INSET * 2) * FLOATING_ASPECT));
  return Math.max(Math.min(FLOATING_MIN_WIDTH, maxWidth), Math.min(maxWidth, requested));
}

export function cornerPosition(corner: FloatingCorner, width: number, bounds: FloatingBounds): FloatingPosition {
  const height = width / FLOATING_ASPECT;
  const left = corner.endsWith("right") ? bounds.left + bounds.width - width - FLOATING_INSET : bounds.left + FLOATING_INSET;
  const top = corner.startsWith("bottom") ? bounds.top + bounds.height - height - FLOATING_INSET : bounds.top + FLOATING_INSET;
  return { left, top };
}

export function clampFloatingPosition(position: FloatingPosition, width: number, bounds: FloatingBounds): FloatingPosition {
  const minLeft = bounds.left + FLOATING_INSET;
  const minTop = bounds.top + FLOATING_INSET;
  return {
    left: Math.max(minLeft, Math.min(bounds.left + bounds.width - width - FLOATING_INSET, position.left)),
    top: Math.max(minTop, Math.min(bounds.top + bounds.height - width / FLOATING_ASPECT - FLOATING_INSET, position.top)),
  };
}

export function nearestFloatingCorner(position: FloatingPosition, width: number, bounds: FloatingBounds): FloatingCorner {
  const centerX = position.left + width / 2;
  const centerY = position.top + width / FLOATING_ASPECT / 2;
  const horizontal = centerX < bounds.left + bounds.width / 2 ? "left" : "right";
  const vertical = centerY < bounds.top + bounds.height / 2 ? "top" : "bottom";
  return `${vertical}-${horizontal}`;
}
