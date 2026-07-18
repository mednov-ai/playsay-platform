import { describe, expect, it } from "vitest";
import {
  resetExpandedMaterialBlock,
  toggleExpandedMaterialBlock,
} from "./materialEditorCollapse";

describe("material editor block collapse state", () => {
  it("keeps at most one block expanded", () => {
    expect(toggleExpandedMaterialBlock(null, "first-block")).toBe("first-block");
    expect(toggleExpandedMaterialBlock("first-block", "second-block")).toBe("second-block");
    expect(toggleExpandedMaterialBlock("second-block", "second-block")).toBeNull();
  });

  it("resets to fully collapsed state", () => {
    expect(resetExpandedMaterialBlock()).toBeNull();
  });
});
