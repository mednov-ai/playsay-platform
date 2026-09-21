import { describe, expect, it } from "vitest";
import { documentVisiblePageIndexes } from "./DocumentMaterialViewer";

describe("documentVisiblePageIndexes", () => {
  it("keeps a separate cover and then advances in spreads", () => {
    expect(documentVisiblePageIndexes(0, 6, "SPREAD", true)).toEqual([0]);
    expect(documentVisiblePageIndexes(1, 6, "SPREAD", true)).toEqual([1, 2]);
    expect(documentVisiblePageIndexes(2, 6, "SPREAD", true)).toEqual([1, 2]);
    expect(documentVisiblePageIndexes(5, 6, "SPREAD", true)).toEqual([5]);
  });

  it("starts a spread with the first page when cover separation is disabled", () => {
    expect(documentVisiblePageIndexes(0, 5, "SPREAD", false)).toEqual([0, 1]);
    expect(documentVisiblePageIndexes(3, 5, "SPREAD", false)).toEqual([2, 3]);
    expect(documentVisiblePageIndexes(4, 5, "SPREAD", false)).toEqual([4]);
  });

  it("renders exactly one page in single mode", () => {
    expect(documentVisiblePageIndexes(4, 5, "SINGLE", true)).toEqual([4]);
    expect(documentVisiblePageIndexes(0, 1, "SPREAD", true)).toEqual([0]);
    expect(documentVisiblePageIndexes(0, 1, "SPREAD", false)).toEqual([0]);
  });
});
