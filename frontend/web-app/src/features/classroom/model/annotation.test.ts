import { describe, expect, it } from "vitest";
import {
  annotationContentFromElements,
  annotationContentFromJson,
  annotationElementsForPage,
  canReparentMindMapNode,
  deleteMindMapSubtree,
  eraseAnnotationElementsAt,
  layoutMindMap,
  pointsToSvgPath,
  type AnnotationElement,
  type AnnotationMindMapNode,
  type AnnotationStroke,
} from "./annotation";

describe("annotation model", () => {
  it("stores mixed board elements in schema v4 material-page coordinates", () => {
    const elements: AnnotationElement[] = [
      stroke(),
      {
        color: "#2574ff",
        createdAt: 2,
        end: { pageId: "page-1", x: 400, y: 300 },
        id: "arrow-1",
        kind: "arrow",
        pageId: "page-1",
        start: { pageId: "page-1", x: 200, y: 100 },
        strokeWidth: 16,
      },
      {
        color: "#111111",
        createdAt: 3,
        fill: "#fff0a8",
        height: 160,
        id: "sticky-1",
        kind: "stickyNote",
        pageId: "page-1",
        text: "Remember this",
        width: 220,
        x: 500,
        y: 500,
      },
    ];

    expect(annotationContentFromElements(elements, "page-1")).toEqual({
      activePageId: "page-1",
      coordinateSpace: "material-page",
      elements: expect.arrayContaining([
        expect.objectContaining({ id: "stroke-1", kind: "stroke", strokeWidth: 8 }),
        expect.objectContaining({ id: "arrow-1", kind: "arrow", strokeWidth: 16 }),
        expect.objectContaining({ id: "sticky-1", kind: "stickyNote", text: "Remember this" }),
      ]),
      schemaVersion: 4,
    });
  });

  it("reads legacy annotation strokes with the default width", () => {
    const content = annotationContentFromJson({
      schemaVersion: 1,
      strokes: [
        {
          color: "#2574ff",
          id: "legacy",
          points: [{ x: 10, y: 20 }],
        },
      ],
    });

    expect(content.elements[0]).toEqual({
      color: "#2574ff",
      createdAt: 0,
      id: "legacy",
      kind: "stroke",
      pageId: "material",
      points: [{ pageId: "material", x: 10, y: 20 }],
      strokeWidth: 8,
    });
    expect(content.activePageId).toBe("material");
  });

  it("keeps active page id and filters all element kinds by page", () => {
    const content = annotationContentFromJson({
      activePageId: "page-static",
      schemaVersion: 3,
      elements: [
        { ...stroke(), id: "first", pageId: "page-1" },
        { ...stroke(), id: "static", pageId: "page-static", points: [{ pageId: "page-static", x: 30, y: 40 }] },
      ],
    });

    expect(content.activePageId).toBe("page-static");
    expect(annotationElementsForPage(content.elements, "page-static").map((element) => element.id)).toEqual(["static"]);
  });

  it("erases a stroke when the pointer crosses the middle of a sparse segment", () => {
    const sparseStroke = stroke({
      points: [
        { pageId: "page-1", x: 100, y: 100 },
        { pageId: "page-1", x: 900, y: 100 },
      ],
    });

    const result = eraseAnnotationElementsAt([sparseStroke], { pageId: "page-1", x: 500, y: 110 });

    expect(result.elements).toEqual([]);
    expect(result.erased.map((element) => element.id)).toEqual(["stroke-1"]);
  });

  it("does not erase shapes or strokes from another page", () => {
    const otherPageStroke = stroke({ pageId: "page-2", points: [{ pageId: "page-2", x: 20, y: 20 }] });
    const rectangle: AnnotationElement = {
      color: "#ff5c00",
      createdAt: 3,
      fill: "transparent",
      height: 100,
      id: "rectangle-1",
      kind: "rectangle",
      pageId: "page-1",
      strokeWidth: 8,
      width: 100,
      x: 0,
      y: 0,
    };

    const result = eraseAnnotationElementsAt([otherPageStroke, rectangle], { pageId: "page-1", x: 20, y: 20 });

    expect(result.elements).toEqual([otherPageStroke, rectangle]);
    expect(result.erased).toEqual([]);
  });

  it("renders svg paths from normalized points", () => {
    expect(pointsToSvgPath([
      { pageId: "material", x: 1, y: 2 },
      { pageId: "material", x: 3.45, y: 4.56 },
    ])).toBe("M 1.0 2.0 L 3.5 4.6");
  });

  it("serializes mind map nodes and lays branches out on both sides", () => {
    const root = mindMapNode({ id: "map-1", mapId: "map-1", parentId: null, side: "root", x: 390, y: 450 });
    const left = mindMapNode({ id: "left", mapId: "map-1", parentId: root.id, side: "left", order: 0 });
    const right = mindMapNode({ id: "right", mapId: "map-1", parentId: root.id, side: "right", order: 0 });
    const laidOut = layoutMindMap([root, left, right], root.mapId).filter((element): element is AnnotationMindMapNode => element.kind === "mindMapNode");

    expect(laidOut.find((node) => node.id === "left")!.x).toBeLessThan(root.x);
    expect(laidOut.find((node) => node.id === "right")!.x).toBeGreaterThan(root.x);
    expect(annotationContentFromElements(laidOut, "page-1")).toEqual(expect.objectContaining({
      schemaVersion: 4,
      elements: expect.arrayContaining([expect.objectContaining({ kind: "mindMapNode", mapId: "map-1", parentId: "map-1" })]),
    }));
  });

  it("deletes a mind map subtree and prevents cyclic reparenting", () => {
    const root = mindMapNode({ id: "map-1", mapId: "map-1", parentId: null, side: "root" });
    const child = mindMapNode({ id: "child", mapId: "map-1", parentId: root.id });
    const grandchild = mindMapNode({ id: "grandchild", mapId: "map-1", parentId: child.id });
    const unrelated = stroke();
    const elements: AnnotationElement[] = [root, child, grandchild, unrelated];

    expect(deleteMindMapSubtree(elements, child.id).map((element) => element.id)).toEqual([root.id, unrelated.id]);
    expect(canReparentMindMapNode(elements, child.id, grandchild.id)).toBe(false);
    expect(canReparentMindMapNode(elements, grandchild.id, root.id)).toBe(true);
  });
});

function mindMapNode(overrides: Partial<AnnotationMindMapNode> = {}): AnnotationMindMapNode {
  return {
    color: "#ff5c00",
    createdAt: 1,
    fill: "#ffffff",
    height: 66,
    id: "node-1",
    kind: "mindMapNode",
    mapId: "map-1",
    order: 0,
    pageId: "page-1",
    parentId: "map-1",
    side: "right",
    text: "Rule",
    width: 184,
    x: 0,
    y: 0,
    ...overrides,
  };
}

function stroke(overrides: Partial<AnnotationStroke> = {}): AnnotationStroke {
  return {
    color: "#ff5c00",
    createdAt: 1,
    id: "stroke-1",
    kind: "stroke",
    pageId: "page-1",
    points: [
      { pageId: "page-1", x: 12.345, y: 67.891 },
      { pageId: "page-1", x: 100, y: 200 },
    ],
    strokeWidth: 8,
    ...overrides,
  };
}
