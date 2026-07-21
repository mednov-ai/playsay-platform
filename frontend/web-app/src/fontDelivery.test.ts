import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(resolve(__dirname, "../index.html"), "utf8");
const mainSource = readFileSync(resolve(__dirname, "main.tsx"), "utf8");

describe("web font delivery", () => {
  it("bundles Manrope locally without a render-blocking Google Fonts request", () => {
    expect(indexHtml).not.toContain("fonts.googleapis.com");
    expect(indexHtml).not.toContain("fonts.gstatic.com");
    expect(mainSource).toContain('import "@fontsource-variable/manrope"');
  });
});
