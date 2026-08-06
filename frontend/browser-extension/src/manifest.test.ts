/// <reference types="node" />

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRUSTED_PLAY_SAY_MATCH_PATTERNS } from "./protocol";

type ExtensionManifest = {
  version: string;
  permissions: string[];
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
  "16": "icons/bee-16.png",
  "32": "icons/bee-32.png",
  "48": "icons/bee-48.png",
  "128": "icons/bee-128.png",
};

describe("extension manifest contract", () => {
  it("keeps package and manifest versions aligned", () => {
    expect(manifest.version).toBe("0.1.5");
    expect(extensionPackage.version).toBe(manifest.version);
    expect(frontendLock.packages["browser-extension"]?.version).toBe(manifest.version);
  });

  it("keeps manifest permissions and content-script origins aligned with the runtime guard", () => {
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage", "tabCapture", "tabs"]);
    expect(manifest.permissions).not.toContain("debugger");
    expect(manifest.host_permissions).toEqual(TRUSTED_PLAY_SAY_MATCH_PATTERNS);
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0]?.matches).toEqual(TRUSTED_PLAY_SAY_MATCH_PATTERNS);
  });

  it("registers every required Chrome icon size for the extension and toolbar action", () => {
    expect(manifest.icons).toEqual(expectedIcons);
    expect(manifest.action.default_icon).toEqual(expectedIcons);
    for (const path of Object.values(expectedIcons)) {
      expect(existsSync(new URL(`../public/${path}`, import.meta.url)), path).toBe(true);
    }
  });
});

function readJson<T>(url: URL): T {
  return JSON.parse(readFileSync(url, "utf8")) as T;
}
