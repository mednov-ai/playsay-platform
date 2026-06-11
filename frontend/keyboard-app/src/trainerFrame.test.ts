import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("keyboard trainer wide frame", () => {
  it("caps the desktop trainer frame at the virtual keyboard width", () => {
    expect(styles).toContain("--trainer-frame-width: 1368px");
    expect(styles).toMatch(/\.app-header[\s\S]*width:\s*min\(100%,\s*var\(--trainer-frame-width\)\)/);
    expect(styles).toMatch(/\.side-panel[\s\S]*width:\s*min\(100%,\s*var\(--trainer-frame-width\)\)/);
    expect(styles).toMatch(/\.trainer-surface[\s\S]*justify-items:\s*center/);
    expect(styles).toMatch(
      /\.trainer-toolbar,\s*[\s\S]*\.stats-panel,\s*[\s\S]*\.typing-stage,\s*[\s\S]*\.virtual-keyboard,\s*[\s\S]*\.trainer-footer[\s\S]*width:\s*min\(100%,\s*var\(--trainer-frame-width\)\)/,
    );
    expect(styles).toContain("max-width: var(--trainer-frame-width)");
  });

  it("keeps the main trainer free of persistent gamification blocks", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(shell).not.toContain("GamificationPanel");
    expect(styles).not.toContain(".side-panel .gamification-panel");
    expect(styles).not.toContain("gamification-panel__events");
  });
});
