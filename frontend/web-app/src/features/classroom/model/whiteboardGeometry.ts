import { annotationElementBounds, type AnnotationElement } from "./annotation";
import type { WhiteboardRegion } from "../../../shared/api/whiteboard";

export const whiteboardLimits = { minScale: .25, maxScale: 4, coordinate: 100000 };
export type WhiteboardCamera = { x: number; y: number; scale: number };
export const initialWhiteboardCamera: WhiteboardCamera = { x: 0, y: 0, scale: 1 };
export function boundedCamera(camera: WhiteboardCamera): WhiteboardCamera {
  return { x: Math.max(-100000, Math.min(100000, camera.x)), y: Math.max(-100000, Math.min(100000, camera.y)), scale: Math.max(.25, Math.min(4, camera.scale)) };
}
export function cameraRegion(camera: WhiteboardCamera, width: number, height: number): WhiteboardRegion {
  return { x: camera.x - width / camera.scale / 2, y: camera.y - height / camera.scale / 2, width: width / camera.scale, height: height / camera.scale };
}
export function fitWhiteboardRegion(region: WhiteboardRegion, width: number, height: number): WhiteboardCamera {
  return boundedCamera({ x: region.x + region.width / 2, y: region.y + region.height / 2, scale: Math.min(width / Math.max(1, region.width), height / Math.max(1, region.height)) });
}
export function fitWhiteboardContent(elements: AnnotationElement[], width: number, height: number): WhiteboardCamera {
  if (!elements.length) return initialWhiteboardCamera;
  const bounds = elements.map(annotationElementBounds);
  const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y));
  const right = Math.max(...bounds.map(b => b.x + b.width)), bottom = Math.max(...bounds.map(b => b.y + b.height));
  return fitWhiteboardRegion({ x: x - 60, y: y - 60, width: right - x + 120, height: bottom - y + 120 }, width, height);
}
export function worldPoint(clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">, camera: WhiteboardCamera) {
  return { x: camera.x + (clientX - rect.left - rect.width / 2) / camera.scale, y: camera.y + (clientY - rect.top - rect.height / 2) / camera.scale };
}
