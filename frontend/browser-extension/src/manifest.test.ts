/// <reference types="node" />

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRUSTED_PLAY_SAY_MATCH_PATTERNS } from "./protocol";

type ExtensionManifest = {
  name: string;
  permissions: string[];
  version: string;
  host_permissions: string[];
  icons: Record<string, string>;
  action: { default_icon: Record<string, string> };
  content_scripts: Array<{ matches: string[] }>;
};

const manifest = readJson<ExtensionManifest>(new URL("../public/manifest.json", import.meta.url));
const extensionPackage = readJson<{ version: string }>(new URL("../package.json", import.meta.url));
const frontendLock = readJson<{
  packages: Record<string, { version?: string }>;
}>(new URL("../../package-lock.json", import.meta.url));

const expectedIcons = {
  "16": "icons/honey-school-16.png",
  "32": "icons/honey-school-32.png",
  "48": "icons/honey-school-48.png",
  "128": "icons/honey-school-128.png",
};

describe("extension manifest contract", () => {
  it("keeps package and manifest versions aligned", () => {
    expect(manifest.name).toBe("Honey.school");
    expect(manifest.version).toBe("0.1.7");
    expect(extensionPackage.version).toBe(manifest.version);
    expect(frontendLock.packages["browser-extension"]?.version).toBe(manifest.version);
  });

  it("keeps manifest permissions and content-script origins aligned with the runtime guard", () => {
    expect(manifest.permissions).toContain("debugger");
    expect(manifest.permissions).not.toContain("scripting");
    expect(manifest.host_permissions).toEqual(TRUSTED_PLAY_SAY_MATCH_PATTERNS);
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0]?.matches).toEqual(TRUSTED_PLAY_SAY_MATCH_PATTERNS);
  });

  it("registers every required Chrome icon size for the extension and toolbar action", () => {
    expect(manifest.icons).toEqual(expectedIcons);
    expect(manifest.action.default_icon).toEqual(expectedIcons);
    for (const [size, path] of Object.entries(expectedIcons)) {
      const iconUrl = new URL(`../public/${path}`, import.meta.url);
      expect(existsSync(iconUrl), path).toBe(true);
      expect(readPngDimensions(iconUrl), path).toEqual({
        width: Number(size),
        height: Number(size),
      });
    }
  });
});

function readJson<T>(url: URL): T {
  return JSON.parse(readFileSync(url, "utf8")) as T;
}

function readPngDimensions(url: URL): { width: number; height: number } {
  const png = readFileSync(url);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}
