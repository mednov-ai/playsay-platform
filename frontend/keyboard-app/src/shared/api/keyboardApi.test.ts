import { describe, expect, it } from "vitest";
import { keyboardApiPath } from "./keyboardApi";

describe("keyboard API paths", () => {
  it("keeps trainer calls under the authenticated /api namespace", () => {
    expect(keyboardApiPath("/chord-sets", new URLSearchParams({ layout: "EN" }))).toBe("/api/chord-sets?layout=EN");
    expect(keyboardApiPath("/training/progress")).toBe("/api/training/progress");
  });
});
