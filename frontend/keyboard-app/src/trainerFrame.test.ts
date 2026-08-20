import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(__dirname, "styles.css"), "utf8");
const mainSource = readFileSync(resolve(__dirname, "main.tsx"), "utf8");

describe("keyboard trainer wide frame", () => {
  it("bundles trainer fonts locally without Google Fonts", () => {
    expect(styles).not.toContain("fonts.googleapis.com");
    expect(styles).not.toContain("fonts.gstatic.com");
    expect(mainSource).toContain('import "@fontsource-variable/manrope"');
    expect(mainSource).toContain('import "@fontsource-variable/roboto-flex/full.css"');
    expect(styles).toContain('url("/brand/fonts/quicksand-latin-600.woff2")');
    expect(existsSync(resolve(__dirname, "../public/brand/logo/honey-school-logo.svg"))).toBe(true);
    expect(existsSync(resolve(__dirname, "../public/brand/icons/site.webmanifest"))).toBe(true);
  });

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

  it("keeps progress details in the profile modal instead of the trainer chrome", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(shell).not.toContain('className="progress-summary"');
    expect(shell).not.toContain('className="weak-fingers"');
    expect(shell).toContain("<ProfileProgressSnapshot");
    expect(shell).toContain('className="profile-progress-snapshot"');
    expect(styles).not.toContain(".progress-summary");
    expect(styles).not.toContain(".weak-fingers");
    expect(styles).toContain(".profile-progress-snapshot");
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

  it("keeps the trainer typing strip compact and leaves room for taller keys", () => {
    expect(styles).toMatch(
      /\.trainer-surface--dismissed[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+40px/,
    );
    expect(styles).toMatch(
      /\.practice-workspace[\s\S]*place-items:\s*center/,
    );
    expect(styles).toMatch(
      /\.practice-workspace[\s\S]*min-height:\s*0/,
    );
    expect(styles).toMatch(
      /\.practice-cluster[\s\S]*grid-template-rows:\s*auto\s+auto/,
    );
    expect(styles).toMatch(
      /\.practice-cluster[\s\S]*gap:\s*var\(--practice-cluster-gap\)/,
    );
    expect(styles).toMatch(
      /\.trainer-surface--dismissed\s+\.typing-stage[\s\S]*height:\s*78px/,
    );
    expect(styles).toMatch(
      /\.trainer-surface--dismissed\s+\.stat--metric\s*\{[^}]*min-height:\s*72px/,
    );
    expect(styles).not.toMatch(
      /\.trainer-surface--dismissed\s+\.practice-workspace\s*\{[^}]*min-height:\s*calc/,
    );
    expect(styles).toMatch(
      /\.stats-panel--practice[\s\S]*grid-template-rows:\s*minmax\(62px,\s*auto\)\s+minmax\(112px,\s*1fr\)\s+auto/,
    );
  });

  it("keeps the metronome footer inside the MacBook-class trainer viewport", () => {
    expect(styles).toMatch(/\.trainer-surface--dismissed\s+\.virtual-keyboard[\s\S]*--key-height:\s*clamp\(42px,\s*6vh,\s*52px\)/);
    expect(styles).toMatch(/\.trainer-surface--dismissed\s+\.trainer-footer[\s\S]*min-height:\s*34px/);
    expect(styles).toMatch(/\.trainer-surface--dismissed\s+\.metronome__slider\s+input[\s\S]*width:\s*126px/);
    expect(styles).toMatch(/\.trainer-surface--dismissed\s+\.result-box[\s\S]*min-height:\s*32px/);
  });

  it("caps the taller keyboard keys again on phone-sized viewports", () => {
    expect(styles).toMatch(
      /@media \(max-width:\s*720px\)[\s\S]*\.trainer-surface--dismissed\s+\.virtual-keyboard,[\s\S]*\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.virtual-keyboard[\s\S]*--key-height:\s*clamp\(40px,\s*11\.8vw,\s*48px\)/,
    );
  });

  it("gives focused practice taller keyboard keys and keeps metric digits height-linked", () => {
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed[\s\S]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+42px/,
    );
    expect(styles).not.toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.practice-workspace\s*\{[^}]*min-height:\s*calc/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.stats-panel--practice[\s\S]*grid-template-rows:\s*minmax\(58px,\s*auto\)\s+minmax\(80px,\s*auto\)\s+auto/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.practice-cluster[\s\S]*--practice-cluster-gap:\s*8px/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.typing-stage[\s\S]*height:\s*82px/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.virtual-keyboard[\s\S]*--key-height:\s*clamp\(53px,\s*7\.4vh,\s*58px\)/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.stats-panel--practice\s+\.stat--metric[\s\S]*min-height:\s*80px/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.stats-panel--practice\s+\.stat\s*\{[\s\S]*min-height:\s*80px/,
    );
    expect(styles).toMatch(
      /\.stat--metric[\s\S]*container-type:\s*size/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.stats-panel--practice\s+\.stat[\s\S]*--stat-number-size:\s*clamp\(42px,\s*57cqh,\s*86px\)/,
    );
    expect(styles).toMatch(
      /\.trainer-layout--practice\s+\.trainer-surface--dismissed\s+\.stats-panel--practice\s+\.stat[\s\S]*--stat-value-scale-y:\s*1\.28/,
    );
    expect(styles).toMatch(
      /\.stat__value-line[\s\S]*transform:\s*scale\(var\(--stat-value-scale-x\),\s*var\(--stat-value-scale-y\)\)/,
    );
    expect(styles).toMatch(/\.stats-panel--practice\s+\.stat__value-line[\s\S]*align-self:\s*start/);
    expect(styles).toMatch(/\.stats-panel--practice\s+\.stat__value-line[\s\S]*transform-origin:\s*center top/);
  });

  it("keeps the focused typing strip as a single measured line", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(shell).toContain('className="practice-workspace"');
    expect(shell).toContain('className="practice-cluster"');
    expect(shell).toMatch(/<div className="practice-cluster">[\s\S]*<div className="typing-stage">[\s\S]*<VirtualKeyboard/);
    expect(shell).toMatch(/<div className="trainer-footer">/);
    expect(styles).toMatch(/\.typing-strip[\s\S]*--typing-row-count:\s*1/);
    expect(styles).toMatch(/\.typing-strip[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)/);
    expect(styles).toMatch(/\.typing-strip[\s\S]*font-family:\s*"Roboto Flex Variable"/);
    expect(styles).toMatch(/\.typing-strip[\s\S]*font-variation-settings:\s*"wdth"\s+48,\s*"opsz"\s+96,\s*"GRAD"\s+-35/);
    expect(styles).toMatch(/\.typing-strip[\s\S]*line-height:\s*1\.18/);
    expect(styles).toMatch(/\.typing-strip__line[\s\S]*overflow:\s*visible/);
    expect(shell).toContain("measureTypingTextWithElement");
    expect(shell).not.toContain("rowCountForTypingStrip");
    expect(shell).not.toContain("fourRowHeight");
    expect(shell).not.toContain("setTypingRowCount");
    expect(shell).not.toContain("typingStripStyle");
  });

  it("renders spaces as subtle dot markers without changing measured space width", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(shell).toContain("showSpaceMarker");
    expect(shell).toContain("hasPreviousVisibleCharacter");
    expect(shell).toContain('item.isSpace ? (showSpaceMarker ? "·" : "\\u00a0") : item.char');
    expect(styles).toMatch(/\.typing-char\.is-space[\s\S]*width:\s*0\.58em/);
    expect(styles).toMatch(/\.typing-char\.is-space[\s\S]*font-size:\s*1em/);
    expect(styles).toMatch(/\.typing-char\.is-space[\s\S]*place-items:\s*center/);
    expect(styles).toMatch(/\.typing-char\.is-space[\s\S]*transform:\s*translateY\(-0\.03em\)\s+scale\(0\.72\)/);
    expect(styles).toMatch(/\.typing-char\.is-space-edge[\s\S]*opacity:\s*0/);
    expect(styles).toMatch(/\.typing-char\.is-space\.is-current[\s\S]*opacity:\s*1/);
  });

  it("uses subtle illuminated cards for the reference-style stats metrics", () => {
    expect(styles).toMatch(/\.stat--metric[\s\S]*position:\s*relative/);
    expect(styles).toContain(".stat--metric::before");
    expect(styles).toContain("radial-gradient(ellipse at center");
  });

  it("keeps dark stats tiles matte instead of using white plastic highlights", () => {
    expect(styles).toContain(".dark .stats-panel");
    expect(styles).toContain(".dark .stats-panel__set-card");
    expect(styles).toContain(".dark .stat--metric");
    expect(styles).toMatch(
      /\.dark\s+\.stats-panel__set-card,[\s\S]*linear-gradient\(180deg,\s*color-mix\(in srgb,\s*var\(--surface-strong\)\s*86%,\s*var\(--surface\)\)/,
    );
    expect(styles).toMatch(
      /\.dark\s+\.stat--metric[\s\S]*box-shadow:\s*inset 0 1px 0 rgb\(255 122 47 \/ 0\.08\)/,
    );

    const darkTileStart = styles.indexOf(".dark .stats-panel");
    const darkTileEnd = styles.indexOf(".stat--metric > span", darkTileStart);
    const darkTileStyles = styles.slice(darkTileStart, darkTileEnd);

    expect(darkTileEnd).toBeGreaterThan(darkTileStart);
    expect(darkTileStyles).not.toContain("rgb(255 255 255 / 0.9");
    expect(darkTileStyles).not.toContain("rgb(255 255 255 / 0.8");
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
    expect(styles).toMatch(/\.stat--metric[\s\S]*--stat-value-scale-x:\s*0\.78/);
    expect(styles).toMatch(/\.stat--metric[\s\S]*--stat-value-scale-y:\s*1/);
    expect(styles).toMatch(/\.stat--metric[\s\S]*--stat-value-slot:\s*8\.2ch/);
    expect(styles).toMatch(/\.stats-panel__mastery-card[\s\S]*--stat-number-size:\s*clamp\(30px,\s*2\.8vw,\s*40px\)/);
    expect(styles).toMatch(/\.stat__value-line[\s\S]*font-family:\s*"Roboto Flex Variable"/);
    expect(styles).toMatch(/\.stats-panel__mastery-value-line[\s\S]*font-family:\s*"Roboto Flex Variable"/);
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

  it("keeps advanced code settings in a modal so the side panel stays compact", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(shell).toContain("showAdvancedSettingsModal");
    expect(shell).toContain("advanced-settings-modal");
    expect(shell).toContain("numberRowEnabled");
    expect(shell).toContain("openAdvancedSettings");
    expect(shell).not.toContain("code-practice-panel");
    expect(styles).toContain(".advanced-settings-modal");
    expect(styles).toContain(".advanced-summary-card");
    expect(styles).not.toContain(".code-practice-panel");
  });

  it("uses a compact advanced mode segmented control instead of the old checkbox label", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(shell).toContain("advanced-mode-control");
    expect(shell).toContain("advancedModeOptionNormal");
    expect(shell).toContain("advancedModeOptionAdvanced");
    expect(shell).not.toContain('className="advanced-mode-toggle"');
    expect(styles).toContain(".advanced-mode-control");
    expect(styles).not.toContain(".advanced-mode-toggle");
  });

  it("does not paint the entire top number row when the number row is enabled", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(shell).not.toContain("numberRowActive=");
    expect(styles).not.toContain(".virtual-keyboard--number-row-focus .virtual-keyboard__row:first-child");
    expect(styles).not.toContain("virtual-keyboard--number-row-focus");
  });

  it("locks advanced settings for the whole exercise result flow", () => {
    const shell = readFileSync(resolve(__dirname, "widgets/shell/KeyboardTrainerShell.tsx"), "utf8");

    expect(shell).toContain('sessionFlow.phase === "finished"');
    expect(shell).toContain("advancedSettingsLocked");
    expect(shell).toContain("disabled={advancedSettingsLocked}");
  });

  it("renames the visible programming toggle to the advanced mode in all locales", () => {
    const ru = readFileSync(resolve(__dirname, "shared/i18n/resources/ru.ts"), "utf8");
    const en = readFileSync(resolve(__dirname, "shared/i18n/resources/en.ts"), "utf8");
    const de = readFileSync(resolve(__dirname, "shared/i18n/resources/de.ts"), "utf8");
    const fr = readFileSync(resolve(__dirname, "shared/i18n/resources/fr.ts"), "utf8");

    expect(ru).toContain('advancedPractice: "Продвинутый режим"');
    expect(en).toContain('advancedPractice: "Advanced mode"');
    expect(de).toContain('advancedPractice: "Erweiterter Modus"');
    expect(fr).toContain('advancedPractice: "Mode avancé"');
    expect(ru).not.toContain('codePractice: "Программирование"');
    expect(en).not.toContain('codePractice: "Programming"');
  });
});
