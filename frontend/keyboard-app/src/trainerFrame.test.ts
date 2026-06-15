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
      /\.stats-panel,\s*[\s\S]*\.typing-stage,\s*[\s\S]*\.virtual-keyboard,\s*[\s\S]*\.trainer-footer[\s\S]*width:\s*min\(100%,\s*var\(--trainer-frame-width\)\)/,
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
    expect(shell).toContain("currentTitle={activeSetTitle}");
    expect(shell).not.toContain('<div className="trainer-toolbar">');
    expect(styles).toContain(".trainer-layout--practice");
    expect(styles).toContain(".stats-panel__top");
    expect(styles).toContain(".stats-panel--practice");
    expect(styles).toContain(".stat__value--animated");
  });

  it("gives focused practice spare vertical space to stats instead of the typing strip", () => {
    expect(styles).toMatch(
      /\.trainer-surface--dismissed[\s\S]*grid-template-rows:\s*minmax\(188px,\s*1fr\)\s+120px\s+minmax\(198px,\s*auto\)\s+34px/,
    );
    expect(styles).toMatch(
      /\.trainer-surface--dismissed\s+\.typing-stage[\s\S]*height:\s*120px/,
    );
    expect(styles).toMatch(
      /\.stats-panel--practice[\s\S]*grid-template-rows:\s*minmax\(62px,\s*auto\)\s+minmax\(112px,\s*1fr\)\s+auto/,
    );
  });

  it("keeps the metronome footer inside the MacBook-class trainer viewport", () => {
    expect(styles).toMatch(/\.trainer-surface--dismissed\s+\.virtual-keyboard[\s\S]*--key-height:\s*39px/);
    expect(styles).toMatch(/\.trainer-surface--dismissed\s+\.trainer-footer[\s\S]*min-height:\s*34px/);
    expect(styles).toMatch(/\.trainer-surface--dismissed\s+\.metronome__slider\s+input[\s\S]*width:\s*126px/);
    expect(styles).toMatch(/\.trainer-surface--dismissed\s+\.result-box[\s\S]*min-height:\s*32px/);
  });

  it("gives focused practice taller keyboard keys so stats cards do not over-expand", () => {
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed[\s\S]*grid-template-rows:\s*minmax\(172px,\s*1fr\)\s+180px\s+minmax\(242px,\s*auto\)\s+34px/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.typing-stage[\s\S]*height:\s*180px/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.virtual-keyboard[\s\S]*--key-height:\s*43px/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.stats-panel--practice\s+\.stat--metric[\s\S]*min-height:\s*70px/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.stats-panel--practice\s+\.stat[\s\S]*--stat-number-size:\s*clamp\(44px,\s*6\.4vh,\s*60px\)/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.stats-panel--practice\s+\.stat[\s\S]*--stat-value-scale-y:\s*1\.14/,
    );
    expect(styles).toMatch(
      /\.stat__value-line[\s\S]*transform:\s*scale\(var\(--stat-value-scale-x\),\s*var\(--stat-value-scale-y\)\)/,
    );
  });

  it("lets the focused typing strip expand to measured extra lines", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(styles).toMatch(/\.typing-strip[\s\S]*--typing-row-count:\s*2/);
    expect(styles).toMatch(/\.typing-strip[\s\S]*grid-template-rows:\s*repeat\(var\(--typing-row-count\),\s*minmax\(0,\s*1fr\)\)/);
    expect(shell).toContain("rowCountForTypingStrip");
    expect(shell).toContain("fourRowHeight");
    expect(shell).toContain("return 4;");
    expect(shell).toContain("setTypingRowCount");
    expect(shell).toContain('style={typingStripStyle}');
  });

  it("renders spaces as subtle dot markers without changing measured space width", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(shell).toContain('item.isSpace ? "·" : item.char');
    expect(styles).toMatch(/\.typing-char\.is-space[\s\S]*width:\s*0\.58em/);
    expect(styles).toMatch(/\.typing-char\.is-space[\s\S]*place-items:\s*center/);
    expect(styles).toMatch(/\.typing-char\.is-space\.is-current[\s\S]*opacity:\s*1/);
  });

  it("uses subtle illuminated cards for the reference-style stats metrics", () => {
    expect(styles).toMatch(/\.stat--metric[\s\S]*position:\s*relative/);
    expect(styles).toContain(".stat--metric::before");
    expect(styles).toContain("radial-gradient(ellipse at center");
  });

  it("uses one tile language for the merged stats header", () => {
    expect(styles).toContain(".stats-panel__set-card");
    expect(styles).toContain(".stats-panel__actions-card");
    expect(styles).toMatch(/\.stats-panel__set-card,[\s\S]*\.stats-panel__mastery-card,[\s\S]*\.stats-panel__actions-card[\s\S]*border:\s*1px solid color-mix/);
    expect(styles).toMatch(/\.stats-panel__set-card,[\s\S]*\.stats-panel__mastery-card[\s\S]*grid-template-columns:\s*46px\s+minmax\(0,\s*1fr\)/);
    expect(styles).toMatch(/\.stats-panel__set-icon,[\s\S]*\.stats-panel__mastery-icon[\s\S]*border-radius:\s*10px/);
    expect(styles).toMatch(/\.stats-panel__actions-card[\s\S]*min-height:\s*64px/);
    expect(styles).not.toContain(".stats-panel__set-rail");
    expect(styles).not.toContain(".stats-panel__mastery-rail");
    expect(styles).not.toContain(".stats-panel__set-copy p");
  });

  it("stretches practice metric numerals vertically without widening them", () => {
    expect(styles).not.toContain("#ffb238");
    expect(styles).toContain("family=Manrope");
    expect(styles).toContain("family=Roboto+Flex");
    expect(styles).toMatch(/\.stat--metric[\s\S]*--stat-value-scale-x:\s*0\.78/);
    expect(styles).toMatch(/\.stat--metric[\s\S]*--stat-value-scale-y:\s*1/);
    expect(styles).toMatch(/\.stat--metric[\s\S]*--stat-value-slot:\s*8\.2ch/);
    expect(styles).toMatch(/\.stats-panel__mastery-card[\s\S]*--stat-number-size:\s*clamp\(30px,\s*2\.8vw,\s*40px\)/);
    expect(styles).toMatch(/\.stat__value-line[\s\S]*font-family:\s*"Roboto Flex"/);
    expect(styles).toMatch(/\.stats-panel__mastery-value-line[\s\S]*font-family:\s*"Roboto Flex"/);
    expect(styles).toMatch(/\.stats-panel__mastery-value-line[\s\S]*font-variation-settings:\s*"wdth"\s+45,\s*"opsz"\s+96,\s*"GRAD"\s+-80/);
    expect(styles).toMatch(/\.stats-panel__mastery-number[\s\S]*linear-gradient\(180deg,\s*#ff9a70\s*0%,\s*#ef5a19\s*48%,\s*#dd4808\s*100%\)/);
    expect(styles).toMatch(/\.stat__value-line[\s\S]*font-variation-settings:\s*"wdth"\s+45,\s*"opsz"\s+96,\s*"GRAD"\s+-80/);
    expect(styles).toMatch(/\.stat__value-line[\s\S]*width:\s*var\(--stat-value-slot\)/);
    expect(styles).toMatch(/\.stat__suffix[\s\S]*margin-left:\s*0\.08em/);
    expect(styles).toMatch(/\.stat__suffix--unit[\s\S]*font-size:\s*var\(--stat-unit-suffix-size\)/);
    expect(styles).toMatch(/\.stat__suffix--unit[\s\S]*margin-left:\s*0\.28em/);
    expect(styles).toMatch(/\.stat__number[\s\S]*linear-gradient\(180deg,\s*#ff9a70\s*0%,\s*#ef5a19\s*48%,\s*#dd4808\s*100%\)/);
    expect(styles).toMatch(/\.stat__number[\s\S]*font-weight:\s*640/);
    expect(styles).toMatch(/\.stat__suffix[\s\S]*font-weight:\s*640/);
    expect(styles).toMatch(
      /\.stats-panel--practice\s+\.stat[\s\S]*--stat-number-size:\s*clamp\(74px,\s*10\.8vh,\s*104px\)/,
    );
    expect(styles).toMatch(
      /\.stats-panel--practice\s+\.stat[\s\S]*--stat-value-scale-x:\s*0\.72/,
    );
    expect(styles).toMatch(
      /\.stats-panel--practice\s+\.stat[\s\S]*--stat-value-scale-y:\s*1\.18/,
    );
    expect(styles).toMatch(
      /\.stats-panel--practice\s+\.stat[\s\S]*--stat-suffix-size:\s*clamp\(40px,\s*5\.8vh,\s*58px\)/,
    );
    expect(styles).toMatch(
      /\.stats-panel--practice\s+\.stat__suffix--unit[\s\S]*font-size:\s*var\(--stat-unit-suffix-size\)/,
    );
    expect(styles).toMatch(
      /\.stat__value-line[\s\S]*transform:\s*scale\(var\(--stat-value-scale-x\),\s*var\(--stat-value-scale-y\)\)/,
    );
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
