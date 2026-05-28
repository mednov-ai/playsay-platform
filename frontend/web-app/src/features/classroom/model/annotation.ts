import type { PointerEvent } from "react";
import type { LessonMaterialJson } from "../../../shared/api/playsay";

export type AnnotationTool = "pointer" | "pen" | "eraser";

export type AnnotationPoint = {
  x: number;
  y: number;
};

export type AnnotationStroke = {
  color: string;
  id: string;
  points: AnnotationPoint[];
};

export function svgPointFromEvent(event: PointerEvent<SVGSVGElement>): AnnotationPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 1000,
    y: ((event.clientY - rect.top) / rect.height) * 700,
  };
}

export function eraseAnnotationAt(
  point: AnnotationPoint,
  setStrokes: (updater: (current: AnnotationStroke[]) => AnnotationStroke[]) => void,
) {
  setStrokes((current) => current.filter((stroke) => distanceToStroke(point, stroke) > 34));
}

export function emptyAnnotationContent(): { schemaVersion: 1; strokes: AnnotationStroke[] } {
  return { schemaVersion: 1, strokes: [] };
}

export function annotationContentFromStrokes(strokes: AnnotationStroke[]): LessonMaterialJson {
  return {
    schemaVersion: 1,
    strokes: strokes.map((stroke) => ({
      color: stroke.color,
      id: stroke.id,
      points: stroke.points.map((point) => ({
        x: Number(point.x.toFixed(1)),
        y: Number(point.y.toFixed(1)),
      })),
    })),
  };
}

export function annotationContentFromJson(value: unknown): { schemaVersion: 1; strokes: AnnotationStroke[] } {
  const root = asJsonObject(value);
  const strokes = Array.isArray(root.strokes)
    ? root.strokes
        .map((stroke) => annotationStrokeFromJson(stroke))
        .filter((stroke): stroke is AnnotationStroke => stroke !== null)
    : [];

  return { schemaVersion: 1, strokes };
}

export function pointsToSvgPath(points: AnnotationPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  const [firstPoint, ...rest] = points;
  return rest.reduce(
    (path, point) => `${path} L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    `M ${firstPoint.x.toFixed(1)} ${firstPoint.y.toFixed(1)}`,
  );
}

function annotationStrokeFromJson(value: unknown): AnnotationStroke | null {
  const stroke = asJsonObject(value);
  const id = asString(stroke.id).trim();
  const color = asString(stroke.color).trim() || "#ff5c00";
  const rawPoints = Array.isArray(stroke.points) ? stroke.points : [];
  const points = rawPoints
    .map((point) => {
      const pointObject = asJsonObject(point);
      const x = asNumber(pointObject.x);
      const y = asNumber(pointObject.y);
      return x === null || y === null ? null : { x, y };
    })
    .filter((point): point is AnnotationPoint => point !== null);

  if (!id || points.length === 0) {
    return null;
  }

  return { color, id, points };
}

function distanceToStroke(point: AnnotationPoint, stroke: AnnotationStroke): number {
  return stroke.points.reduce((nearest, strokePoint) => {
    const distance = Math.hypot(point.x - strokePoint.x, point.y - strokePoint.y);
    return Math.min(nearest, distance);
  }, Number.POSITIVE_INFINITY);
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
