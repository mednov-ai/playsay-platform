import { describe, expect, it } from "vitest";
import { documentMaterialsEnabled } from "./documentMaterials";

describe("documentMaterialsEnabled", () => {
  it("enables local development and explicit deploy builds", () => {
    expect(documentMaterialsEnabled({ DEV: true })).toBe(true);
    expect(documentMaterialsEnabled({ DEV: false, VITE_DOCUMENT_MATERIALS_ENABLED: "true" })).toBe(true);
  });

  it("supports non-destructive upload rollback", () => {
    expect(documentMaterialsEnabled({ DEV: false, VITE_DOCUMENT_MATERIALS_ENABLED: "false" })).toBe(false);
    expect(documentMaterialsEnabled({ DEV: false })).toBe(false);
  });
});
