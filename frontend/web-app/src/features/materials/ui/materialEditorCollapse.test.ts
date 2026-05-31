import { describe, expect, it } from "vitest";
import {
  resetMaterialBlockCollapse,
  toggleMaterialBlockCollapse,
} from "./materialEditorCollapse";

describe("material editor block collapse state", () => {
  it("collapses and expands a block without mutating the previous state", () => {
    const initial = new Set(["other-block"]);
    const collapsed = toggleMaterialBlockCollapse(initial, "target-block");

    expect(Array.from(initial)).toEqual(["other-block"]);
    expect(collapsed.has("other-block")).toBe(true);
    expect(collapsed.has("target-block")).toBe(true);

    const expanded = toggleMaterialBlockCollapse(collapsed, "target-block");

    expect(expanded.has("other-block")).toBe(true);
    expect(expanded.has("target-block")).toBe(false);
  });

  it("resets to fully expanded state", () => {
    const reset = resetMaterialBlockCollapse();

    expect(reset.size).toBe(0);
  });
});
