import { existsSync, readFileSync } from "node:fs";
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

  it("delivers the Honey School logo, favicon, manifest, and Quicksand locally", () => {
    const publicRoot = resolve(__dirname, "../public");

    expect(indexHtml).toContain("<title>Honey School</title>");
    expect(indexHtml).toContain("/brand/icons/favicon.svg");
    expect(indexHtml).toContain("/brand/icons/site.webmanifest");
    expect(existsSync(resolve(publicRoot, "brand/logo/honey-school-logo.svg"))).toBe(true);
    expect(existsSync(resolve(publicRoot, "brand/logo/honey-school-logo-reverse.svg"))).toBe(true);
    expect(existsSync(resolve(publicRoot, "brand/fonts/quicksand-latin-600.woff2"))).toBe(true);
  });
});
