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

  it("removes the rough recent dynamics surface from the trainer", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(shell).not.toContain("RecentDynamicsPanel");
    expect(shell).not.toContain("showDynamicsModal");
    expect(shell).not.toContain("recentDynamics");
    expect(styles).not.toContain("dynamics-modal");
    expect(styles).not.toContain("recent-dynamics");
  });

  it("does not present chord-set tier as the student level", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(shell).not.toContain("level-pill");
    expect(shell).not.toContain("level.");
  });

  it("uses a focused practice layout without the side controls while typing", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(shell).toContain('trainerIntroPhase === "dismissed" && !practiceFocusMode');
    expect(shell).toContain('variant={practiceFocusMode ? "practice" : "default"}');
    expect(styles).toContain(".trainer-layout--practice");
    expect(styles).toContain(".stats-panel--practice");
    expect(styles).toContain(".stat__value--animated");
  });

  it("does not render the old preparation reveal overlay copy", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");
    const ru = readFileSync(resolve(__dirname, "shared/i18n/resources/ru.ts"), "utf8");
    const en = readFileSync(resolve(__dirname, "shared/i18n/resources/en.ts"), "utf8");

    expect(shell).not.toContain("trainer-reveal-overlay");
    expect(shell).not.toContain("revealKicker");
    expect(ru).not.toContain("Готовим поле");
    expect(en).not.toContain("Loading field");
  });
});
