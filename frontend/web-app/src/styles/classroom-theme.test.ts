import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const classroomCss = readFileSync(resolve(process.cwd(), "src/styles/classroom.css"), "utf8");
const materialsCss = readFileSync(resolve(process.cwd(), "src/styles/materials.css"), "utf8");
const responsiveCss = readFileSync(resolve(process.cwd(), "src/styles/responsive.css"), "utf8");
const appCss = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

function cssRule(selector: string): string {
  const start = classroomCss.indexOf(`${selector} {`);
  expect(start, `Missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  const bodyStart = classroomCss.indexOf("{", start) + 1;
  const bodyEnd = classroomCss.indexOf("}", bodyStart);
  return classroomCss.slice(bodyStart, bodyEnd);
}

describe("classroom video theme", () => {
  it("uses light product surfaces for video chrome by default", () => {
    expect(cssRule(".playsay-video-rail")).toContain("--playsay-video-chrome: hsl(var(--surface));");
    expect(cssRule(".playsay-video-rail")).toContain("--playsay-video-text: hsl(var(--foreground));");
    expect(cssRule('.playsay-livekit-context[data-lk-theme="default"]')).toContain("color-scheme: light;");
    expect(cssRule(".playsay-classroom-conference")).toContain("background: var(--playsay-video-chrome-muted);");
    expect(cssRule(".playsay-classroom-conference .lk-control-bar")).toContain("background: var(--playsay-video-chrome);");
  });

  it("preserves the established dark video palette in dark mode", () => {
    expect(cssRule(".dark .playsay-video-rail")).toContain("--playsay-video-chrome: #111111;");
    expect(cssRule(".dark .playsay-video-rail")).toContain("--playsay-video-tile: #202020;");
    expect(cssRule('.dark .playsay-livekit-context[data-lk-theme="default"]')).toContain("color-scheme: dark;");
  });

  it("keeps media letterboxing dark in either theme", () => {
    expect(cssRule('.playsay-video-focus > .lk-participant-tile .lk-participant-media-video[data-lk-source="camera"]')).toContain("background: #111111;");
    expect(cssRule('.playsay-video-focus > .lk-participant-tile .lk-participant-media-video[data-lk-source="screen_share"]')).toContain("background: #111111;");
  });

  it("places the portrait connection popup below the compact video controls", () => {
    expect(responsiveCss).toContain('.playsay-classroom-shell[data-viewport-mode="mobilePortrait"] .playsay-connection-popover {');
    expect(responsiveCss).toContain("top: calc(clamp(9.75rem, 25dvh, 12rem) + 0.45rem);");
  });
});

describe("classroom workspace dark theme", () => {
  it("defines semantic dark status surfaces", () => {
    expect(appCss).toContain("--status-success-surface: 150 38% 16%;");
    expect(appCss).toContain("--status-warning-surface: 27 45% 17%;");
    expect(appCss).toContain("--status-danger-surface: 3 42% 17%;");
  });

  it("covers classroom chrome and collaboration surfaces", () => {
    expect(classroomCss).toContain(".dark .playsay-activity-rail,");
    expect(classroomCss).toContain(".dark .playsay-controlled-annotation-canvas,");
    expect(classroomCss).toContain(".dark .playsay-collaboration-student-row,");
    expect(cssRule(".dark .playsay-task-page")).toContain("hsl(var(--surface-muted))");
  });

  it("covers lesson materials, dialogs and answer states", () => {
    expect(materialsCss).toContain(".dark .playsay-material-focus-stack,");
    expect(materialsCss).toContain(".dark .playsay-video-embed-placeholder,");
    expect(materialsCss).toContain(".dark .playsay-word-bank-chip,");
    expect(materialsCss).toContain(".dark .playsay-speaking-prompt,");
    expect(materialsCss).toContain(".dark .playsay-word-bank-drop[data-status=\"wrong\"],");
    expect(materialsCss).toContain(".dark .playsay-mind-map-limit {");
  });
});
