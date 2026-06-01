import { describe, expect, it } from "vitest";
import {
  annotationContentFromJson,
  annotationContentFromStrokes,
  pointsToSvgPath,
  type AnnotationStroke,
} from "./annotation";

describe("annotation model", () => {
  it("stores annotation points in material page coordinates", () => {
    const strokes: AnnotationStroke[] = [
      {
        color: "#ff5c00",
        id: "stroke-1",
        pageId: "material",
        points: [
          { pageId: "material", x: 12.345, y: 67.891 },
          { pageId: "material", x: 100, y: 200 },
        ],
      },
    ];

    expect(annotationContentFromStrokes(strokes)).toEqual({
      coordinateSpace: "material-page",
      schemaVersion: 2,
      strokes: [
        {
          color: "#ff5c00",
          id: "stroke-1",
          pageId: "material",
          points: [
            { pageId: "material", x: 12.3, y: 67.9 },
            { pageId: "material", x: 100, y: 200 },
          ],
        },
      ],
    });
  });

  it("reads legacy annotation strokes into the default material page", () => {
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

    expect(content.strokes[0]).toEqual({
      color: "#2574ff",
      id: "legacy",
      pageId: "material",
      points: [{ pageId: "material", x: 10, y: 20 }],
    });
  });

  it("renders svg paths from normalized points", () => {
    expect(pointsToSvgPath([
      { pageId: "material", x: 1, y: 2 },
      { pageId: "material", x: 3.45, y: 4.56 },
    ])).toBe("M 1.0 2.0 L 3.5 4.6");
  });
});
