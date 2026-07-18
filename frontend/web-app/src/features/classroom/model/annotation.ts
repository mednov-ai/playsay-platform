import type { PointerEvent } from "react";
import type { LessonMaterialJson } from "../../../shared/api/playsay";

export type AnnotationTool =
  | "pointer"
  | "pen"
  | "eraser"
  | "line"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "text"
  | "stickyNote"
  | "mindMap";

export type AnnotationStrokeWidth = 4 | 8 | 16;
export type AnnotationFontSize = 14 | 18 | 24 | 30 | 32;

export const annotationFontSizePresets = [14, 18, 24, 32] as const satisfies readonly AnnotationFontSize[];

export type AnnotationPoint = {
  pageId: string;
  x: number;
  y: number;
};

type AnnotationElementBase = {
  color: string;
  createdAt: number;
  id: string;
  pageId: string;
};

export type AnnotationStroke = AnnotationElementBase & {
  kind: "stroke";
  points: AnnotationPoint[];
  strokeWidth: AnnotationStrokeWidth;
};

export type AnnotationLinearElement = {
  [Kind in "arrow" | "line"]: AnnotationElementBase & {
    end: AnnotationPoint;
    kind: Kind;
    start: AnnotationPoint;
    strokeWidth: AnnotationStrokeWidth;
  };
}["arrow" | "line"];

export type AnnotationBoxElement = {
  [Kind in "ellipse" | "rectangle"]: AnnotationElementBase & {
    fill: string;
    height: number;
    kind: Kind;
    strokeWidth: AnnotationStrokeWidth;
    width: number;
    x: number;
    y: number;
  };
}["ellipse" | "rectangle"];

export type AnnotationTextElement = {
  [Kind in "stickyNote" | "text"]: AnnotationElementBase & {
    fill: string;
    fontSize: AnnotationFontSize;
    height: number;
    kind: Kind;
    text: string;
    width: number;
    x: number;
    y: number;
  };
}["stickyNote" | "text"];

export type AnnotationMindMapNode = AnnotationElementBase & {
  fill: string;
  fontSize: AnnotationFontSize;
  height: number;
  kind: "mindMapNode";
  mapId: string;
  order: number;
  parentId: string | null;
  side: "left" | "right" | "root";
  text: string;
  width: number;
  x: number;
  y: number;
};

export type AnnotationElement =
  | AnnotationStroke
  | AnnotationLinearElement
  | AnnotationBoxElement
  | AnnotationTextElement
  | AnnotationMindMapNode;

export type AnnotationContent = {
  activePageId: string;
  coordinateSpace: "material-page";
  elements: AnnotationElement[];
  schemaVersion: 5;
};

export function svgPointFromEvent(
  event: PointerEvent<SVGElement>,
  pageId = defaultAnnotationPageId,
): AnnotationPoint {
  const svg = event.currentTarget instanceof SVGSVGElement
    ? event.currentTarget
    : event.currentTarget.ownerSVGElement;
  const rect = svg?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { pageId, x: 0, y: 0 };
  }
  return {
    pageId,
    x: clampCoordinate(((event.clientX - rect.left) / rect.width) * annotationCoordinateMax),
    y: clampCoordinate(((event.clientY - rect.top) / rect.height) * annotationCoordinateMax),
  };
}

export function eraseAnnotationElementsAt(
  elements: AnnotationElement[],
  point: AnnotationPoint,
): { elements: AnnotationElement[]; erased: AnnotationStroke[] } {
  const erased: AnnotationStroke[] = [];
  const remaining = elements.filter((element) => {
    if (element.kind !== "stroke" || element.pageId !== point.pageId) {
      return true;
    }
    const hit = distanceToStroke(point, element) <= eraserRadius + element.strokeWidth / 2;
    if (hit) {
      erased.push(element);
    }
    return !hit;
  });
  return { elements: remaining, erased };
}

export function emptyAnnotationContent(activePageId = defaultAnnotationPageId): AnnotationContent {
  return {
    activePageId,
    coordinateSpace: "material-page",
    elements: [],
    schemaVersion: 5,
  };
}

export function annotationContentFromElements(
  elements: AnnotationElement[],
  activePageId = defaultAnnotationPageId,
): LessonMaterialJson {
  return {
    activePageId,
    coordinateSpace: "material-page",
    elements: elements.map((element) => serializeAnnotationElement(element)),
    schemaVersion: 5,
  };
}

export function annotationContentFromJson(
  value: unknown,
  fallbackActivePageId = defaultAnnotationPageId,
): AnnotationContent {
  const root = asJsonObject(value);
  const activePageId = asString(root.activePageId).trim() || fallbackActivePageId;
  const rawElements = Array.isArray(root.elements)
    ? root.elements
    : Array.isArray(root.strokes)
      ? root.strokes
      : [];
  const elements = rawElements
    .map((element, index) => annotationElementFromJson(element, index))
    .filter((element): element is AnnotationElement => element !== null)
    .sort(compareAnnotationElements);

  return {
    activePageId,
    coordinateSpace: "material-page",
    elements,
    schemaVersion: 5,
  };
}

export function annotationElementsForPage(
  elements: AnnotationElement[],
  pageId = defaultAnnotationPageId,
): AnnotationElement[] {
  return elements.filter((element) => element.pageId === pageId);
}

export function mindMapNodes(elements: AnnotationElement[], mapId: string): AnnotationMindMapNode[] {
  return elements.filter((element): element is AnnotationMindMapNode => (
    element.kind === "mindMapNode" && element.mapId === mapId
  ));
}

export function deleteMindMapSubtree(elements: AnnotationElement[], nodeId: string): AnnotationElement[] {
  const deleteIds = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    elements.forEach((element) => {
      if (element.kind === "mindMapNode" && element.parentId && deleteIds.has(element.parentId) && !deleteIds.has(element.id)) {
        deleteIds.add(element.id);
        changed = true;
      }
    });
  }
  return elements.filter((element) => !deleteIds.has(element.id));
}

export function canReparentMindMapNode(elements: AnnotationElement[], nodeId: string, parentId: string): boolean {
  if (nodeId === parentId) return false;
  const nodes = elements.filter((element): element is AnnotationMindMapNode => element.kind === "mindMapNode");
  const parentById = new Map(nodes.map((node) => [node.id, node.parentId]));
  let cursor: string | null | undefined = parentId;
  while (cursor) {
    if (cursor === nodeId) return false;
    cursor = parentById.get(cursor);
  }
  return true;
}

export function layoutMindMap(elements: AnnotationElement[], mapId: string): AnnotationElement[] {
  const nodes = mindMapNodes(elements, mapId);
  const root = nodes.find((node) => node.parentId === null) ?? null;
  if (!root) return elements;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, AnnotationMindMapNode[]>();
  nodes.forEach((node) => {
    if (!node.parentId || !nodeById.has(node.parentId)) return;
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  });
  childrenByParent.forEach((children) => children.sort((left, right) => left.order - right.order || left.createdAt - right.createdAt));
  const laidOut = new Map<string, AnnotationMindMapNode>([[root.id, root]]);
  const subtreeHeight = (node: AnnotationMindMapNode): number => {
    const children = childrenByParent.get(node.id) ?? [];
    if (children.length === 0) return node.height;
    return Math.max(node.height, children.reduce((sum, child) => sum + subtreeHeight(child), 0) + mindMapSiblingGap * (children.length - 1));
  };
  const layoutSide = (side: "left" | "right") => {
    const firstLevel = (childrenByParent.get(root.id) ?? []).filter((node) => node.side === side);
    const total = firstLevel.reduce((sum, node) => sum + subtreeHeight(node), 0) + mindMapSiblingGap * Math.max(0, firstLevel.length - 1);
    let cursor = root.y + root.height / 2 - total / 2;
    const place = (node: AnnotationMindMapNode, parent: AnnotationMindMapNode, top: number) => {
      const height = subtreeHeight(node);
      const next: AnnotationMindMapNode = {
        ...node,
        side,
        x: side === "right" ? parent.x + parent.width + mindMapLevelGap : parent.x - mindMapLevelGap - node.width,
        y: top + height / 2 - node.height / 2,
      };
      laidOut.set(node.id, next);
      let childTop = top;
      (childrenByParent.get(node.id) ?? []).forEach((child) => {
        place(child, next, childTop);
        childTop += subtreeHeight(child) + mindMapSiblingGap;
      });
    };
    firstLevel.forEach((node) => {
      place(node, root, cursor);
      cursor += subtreeHeight(node) + mindMapSiblingGap;
    });
  };
  layoutSide("left");
  layoutSide("right");
  const positioned = [...laidOut.values()];
  const bounds = positioned.reduce((current, node) => ({
    left: Math.min(current.left, node.x),
    top: Math.min(current.top, node.y),
    right: Math.max(current.right, node.x + node.width),
    bottom: Math.max(current.bottom, node.y + node.height),
  }), { left: root.x, top: root.y, right: root.x + root.width, bottom: root.y + root.height });
  const deltaX = bounds.left < mindMapPagePadding
    ? mindMapPagePadding - bounds.left
    : bounds.right > annotationCoordinateMax - mindMapPagePadding
      ? annotationCoordinateMax - mindMapPagePadding - bounds.right
      : 0;
  const deltaY = bounds.top < mindMapPagePadding
    ? mindMapPagePadding - bounds.top
    : bounds.bottom > annotationCoordinateMax - mindMapPagePadding
      ? annotationCoordinateMax - mindMapPagePadding - bounds.bottom
      : 0;
  positioned.forEach((node) => laidOut.set(node.id, {
    ...node,
    x: clampCoordinate(node.x + deltaX, annotationCoordinateMax - node.width),
    y: clampCoordinate(node.y + deltaY, annotationCoordinateMax - node.height),
  }));
  return elements.map((element) => element.kind === "mindMapNode" && element.mapId === mapId
    ? laidOut.get(element.id) ?? element
    : element);
}

export function resizeMindMapNodeForText(
  node: AnnotationMindMapNode,
  fontSize: AnnotationFontSize,
  text = node.text,
): AnnotationMindMapNode {
  const preset = mindMapSizeByFont[fontSize] ?? mindMapSizeByFont[24];
  const horizontalPadding = fontSize >= 24 ? 24 : 20;
  const usableWidth = Math.max(40, preset.width - horizontalPadding);
  const charactersPerLine = Math.max(8, Math.floor(usableWidth / (fontSize * 0.58)));
  const lineCount = (text || " ").split("\n").reduce((total, line) => (
    total + Math.max(1, Math.ceil(Math.max(1, line.length) / charactersPerLine))
  ), 0);
  const contentHeight = Math.ceil(lineCount * fontSize * 1.15 + (fontSize >= 24 ? 20 : 14));
  return {
    ...node,
    fontSize,
    height: Math.min(mindMapMaximumHeight, Math.max(preset.height, contentHeight)),
    text,
    width: preset.width,
  };
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

export function moveAnnotationElement(
  element: AnnotationElement,
  deltaX: number,
  deltaY: number,
): AnnotationElement {
  if (element.kind === "stroke") {
    const bounds = annotationElementBounds(element);
    const clampedDelta = clampDelta(bounds, deltaX, deltaY);
    return {
      ...element,
      points: element.points.map((point) => ({
        ...point,
        x: point.x + clampedDelta.x,
        y: point.y + clampedDelta.y,
      })),
    };
  }
  if (element.kind === "line" || element.kind === "arrow") {
    const bounds = annotationElementBounds(element);
    const clampedDelta = clampDelta(bounds, deltaX, deltaY);
    return {
      ...element,
      end: { ...element.end, x: element.end.x + clampedDelta.x, y: element.end.y + clampedDelta.y },
      start: { ...element.start, x: element.start.x + clampedDelta.x, y: element.start.y + clampedDelta.y },
    };
  }
  const x = clampCoordinate(element.x + deltaX, annotationCoordinateMax - element.width);
  const y = clampCoordinate(element.y + deltaY, annotationCoordinateMax - element.height);
  return { ...element, x, y };
}

export function annotationElementBounds(element: AnnotationElement): AnnotationBounds {
  if (element.kind === "stroke") {
    const xs = element.points.map((point) => point.x);
    const ys = element.points.map((point) => point.y);
    return {
      height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
      width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
      x: Math.min(...xs),
      y: Math.min(...ys),
    };
  }
  if (element.kind === "line" || element.kind === "arrow") {
    return {
      height: Math.max(1, Math.abs(element.end.y - element.start.y)),
      width: Math.max(1, Math.abs(element.end.x - element.start.x)),
      x: Math.min(element.start.x, element.end.x),
      y: Math.min(element.start.y, element.end.y),
    };
  }
  return { height: element.height, width: element.width, x: element.x, y: element.y };
}

export type AnnotationBounds = { height: number; width: number; x: number; y: number };

export function resizeAnnotationElement(
  element: AnnotationElement,
  handle: "end" | "ne" | "nw" | "se" | "start" | "sw",
  point: AnnotationPoint,
): AnnotationElement {
  if (element.kind === "line" || element.kind === "arrow") {
    return handle === "start"
      ? { ...element, start: point }
      : { ...element, end: point };
  }
  if (element.kind === "stroke") {
    return element;
  }
  if (element.kind === "mindMapNode") {
    return element;
  }

  const right = element.x + element.width;
  const bottom = element.y + element.height;
  const nextX = handle === "nw" || handle === "sw"
    ? Math.min(point.x, right - minimumElementSize)
    : element.x;
  const nextY = handle === "nw" || handle === "ne"
    ? Math.min(point.y, bottom - minimumElementSize)
    : element.y;
  const nextRight = handle === "ne" || handle === "se"
    ? Math.max(point.x, element.x + minimumElementSize)
    : right;
  const nextBottom = handle === "sw" || handle === "se"
    ? Math.max(point.y, element.y + minimumElementSize)
    : bottom;
  return {
    ...element,
    height: Math.min(annotationCoordinateMax - nextY, nextBottom - nextY),
    width: Math.min(annotationCoordinateMax - nextX, nextRight - nextX),
    x: clampCoordinate(nextX),
    y: clampCoordinate(nextY),
  };
}

export function isStrokeStyledElement(
  element: AnnotationElement,
): element is AnnotationStroke | AnnotationLinearElement | AnnotationBoxElement {
  return element.kind !== "text" && element.kind !== "stickyNote" && element.kind !== "mindMapNode";
}

export function compareAnnotationElements(left: AnnotationElement, right: AnnotationElement): number {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

function serializeAnnotationElement(element: AnnotationElement): Record<string, unknown> {
  const base = {
    color: element.color,
    createdAt: element.createdAt,
    id: element.id,
    kind: element.kind,
    pageId: element.pageId,
  };
  if (element.kind === "stroke") {
    return {
      ...base,
      points: element.points.map(serializePoint),
      strokeWidth: element.strokeWidth,
    };
  }
  if (element.kind === "line" || element.kind === "arrow") {
    return {
      ...base,
      end: serializePoint(element.end),
      start: serializePoint(element.start),
      strokeWidth: element.strokeWidth,
    };
  }
  if (element.kind === "mindMapNode") {
    return {
      ...base,
      fill: element.fill,
      fontSize: element.fontSize,
      height: roundCoordinate(element.height),
      mapId: element.mapId,
      order: element.order,
      parentId: element.parentId,
      side: element.side,
      text: element.text,
      width: roundCoordinate(element.width),
      x: roundCoordinate(element.x),
      y: roundCoordinate(element.y),
    };
  }
  return {
    ...base,
    fill: element.fill,
    ...(element.kind === "text" || element.kind === "stickyNote" ? { fontSize: element.fontSize } : {}),
    height: roundCoordinate(element.height),
    ...(element.kind === "text" || element.kind === "stickyNote" ? { text: element.text } : { strokeWidth: element.strokeWidth }),
    width: roundCoordinate(element.width),
    x: roundCoordinate(element.x),
    y: roundCoordinate(element.y),
  };
}

function serializePoint(point: AnnotationPoint): AnnotationPoint {
  return { pageId: point.pageId, x: roundCoordinate(point.x), y: roundCoordinate(point.y) };
}

function annotationElementFromJson(value: unknown, index: number): AnnotationElement | null {
  const element = asJsonObject(value);
  const id = asString(element.id).trim();
  const color = asString(element.color).trim() || defaultAnnotationColor;
  const pageId = asString(element.pageId).trim() || defaultAnnotationPageId;
  const kind = annotationElementKind(element.kind, element.points);
  const createdAt = asNumber(element.createdAt) ?? index;
  if (!id || !kind) {
    return null;
  }
  const base = { color, createdAt, id, pageId };

  if (kind === "stroke") {
    const rawPoints = Array.isArray(element.points) ? element.points : [];
    const points = rawPoints
      .map((point) => annotationPointFromJson(point, pageId))
      .filter((point): point is AnnotationPoint => point !== null);
    return points.length === 0
      ? null
      : { ...base, kind, points, strokeWidth: annotationStrokeWidth(element.strokeWidth) };
  }
  if (kind === "line" || kind === "arrow") {
    const start = annotationPointFromJson(element.start, pageId);
    const end = annotationPointFromJson(element.end, pageId);
    return start && end
      ? { ...base, end, kind, start, strokeWidth: annotationStrokeWidth(element.strokeWidth) }
      : null;
  }

  const x = asNumber(element.x);
  const y = asNumber(element.y);
  const width = asNumber(element.width);
  const height = asNumber(element.height);
  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  if (kind === "mindMapNode") {
    const parentId = asString(element.parentId).trim() || null;
    const mapId = asString(element.mapId).trim() || (parentId ? "" : id);
    if (!mapId) return null;
    const sideValue = asString(element.side);
    const fontSize = annotationFontSize(element.fontSize, parentId === null ? 24 : 18);
    return resizeMindMapNodeForText({
      ...base,
      fill: asString(element.fill) || defaultMindMapFill,
      fontSize,
      height: Math.max(minimumElementSize, height),
      kind,
      mapId,
      order: asNumber(element.order) ?? index,
      parentId,
      side: parentId === null ? "root" : sideValue === "left" ? "left" : "right",
      text: asString(element.text).slice(0, mindMapTextLimit),
      width: Math.max(minimumElementSize, width),
      x: clampCoordinate(x),
      y: clampCoordinate(y),
    }, fontSize, asString(element.text).slice(0, mindMapTextLimit));
  }
  if (kind === "text" || kind === "stickyNote") {
    return {
      ...base,
      fill: asString(element.fill) || (kind === "stickyNote" ? defaultStickyFill : "transparent"),
      fontSize: annotationFontSize(element.fontSize, 30),
      height: Math.max(minimumElementSize, height),
      kind,
      text: asString(element.text),
      width: Math.max(minimumElementSize, width),
      x: clampCoordinate(x),
      y: clampCoordinate(y),
    };
  }
  return {
    ...base,
    fill: asString(element.fill) || "transparent",
    height: Math.max(minimumElementSize, height),
    kind,
    strokeWidth: annotationStrokeWidth(element.strokeWidth),
    width: Math.max(minimumElementSize, width),
    x: clampCoordinate(x),
    y: clampCoordinate(y),
  };
}

function annotationElementKind(kindValue: unknown, legacyPoints: unknown): AnnotationElement["kind"] | null {
  if (typeof kindValue === "string" && annotationElementKinds.has(kindValue)) {
    return kindValue as AnnotationElement["kind"];
  }
  return Array.isArray(legacyPoints) ? "stroke" : null;
}

function annotationPointFromJson(value: unknown, fallbackPageId: string): AnnotationPoint | null {
  const point = asJsonObject(value);
  const x = asNumber(point.x);
  const y = asNumber(point.y);
  if (x === null || y === null) {
    return null;
  }
  return {
    pageId: asString(point.pageId).trim() || fallbackPageId,
    x: clampCoordinate(x),
    y: clampCoordinate(y),
  };
}

function annotationStrokeWidth(value: unknown): AnnotationStrokeWidth {
  const width = asNumber(value);
  return width === 4 || width === 16 ? width : 8;
}

function annotationFontSize(value: unknown, fallback: AnnotationFontSize): AnnotationFontSize {
  const fontSize = asNumber(value);
  return fontSize === 14 || fontSize === 18 || fontSize === 24 || fontSize === 30 || fontSize === 32
    ? fontSize
    : fallback;
}

function distanceToStroke(point: AnnotationPoint, stroke: AnnotationStroke): number {
  if (stroke.points.length === 1) {
    return pointDistance(point, stroke.points[0]);
  }
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < stroke.points.length; index += 1) {
    nearest = Math.min(nearest, distanceToSegment(point, stroke.points[index - 1], stroke.points[index]));
  }
  return nearest;
}

function distanceToSegment(point: AnnotationPoint, start: AnnotationPoint, end: AnnotationPoint): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const squaredLength = deltaX * deltaX + deltaY * deltaY;
  if (squaredLength === 0) {
    return pointDistance(point, start);
  }
  const projection = Math.max(0, Math.min(1, (
    (point.x - start.x) * deltaX + (point.y - start.y) * deltaY
  ) / squaredLength));
  return Math.hypot(point.x - (start.x + projection * deltaX), point.y - (start.y + projection * deltaY));
}

function pointDistance(left: AnnotationPoint, right: AnnotationPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clampDelta(bounds: AnnotationBounds, deltaX: number, deltaY: number): { x: number; y: number } {
  return {
    x: Math.max(-bounds.x, Math.min(annotationCoordinateMax - bounds.x - bounds.width, deltaX)),
    y: Math.max(-bounds.y, Math.min(annotationCoordinateMax - bounds.y - bounds.height, deltaY)),
  };
}

function clampCoordinate(value: number, max = annotationCoordinateMax): number {
  return Math.max(0, Math.min(max, value));
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(1));
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

const annotationCoordinateMax = 1000;
const annotationElementKinds = new Set([
  "arrow",
  "ellipse",
  "line",
  "mindMapNode",
  "rectangle",
  "stickyNote",
  "stroke",
  "text",
]);
const defaultAnnotationColor = "#ff5c00";
const defaultAnnotationPageId = "material";
const defaultStickyFill = "#fff0a8";
const defaultMindMapFill = "#ffffff";
const eraserRadius = 28;
const minimumElementSize = 36;
const mindMapLevelGap = 52;
const mindMapPagePadding = 20;
const mindMapSiblingGap = 16;
const mindMapMaximumHeight = 180;
const mindMapSizeByFont: Record<AnnotationFontSize, { height: number; width: number }> = {
  14: { height: 46, width: 132 },
  18: { height: 56, width: 148 },
  24: { height: 68, width: 180 },
  30: { height: 86, width: 208 },
  32: { height: 92, width: 220 },
};
export const mindMapNodeLimit = 50;
export const mindMapTextLimit = 500;
