import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const classroomCss = readFileSync(resolve(process.cwd(), "src/styles/classroom.css"), "utf8");

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
    expect(cssRule('.playsay-classroom-room [data-lk-theme="default"]')).toContain("color-scheme: light;");
    expect(cssRule(".playsay-classroom-conference")).toContain("background: var(--playsay-video-chrome-muted);");
    expect(cssRule(".playsay-classroom-conference .lk-control-bar")).toContain("background: var(--playsay-video-chrome);");
  });

  it("preserves the established dark video palette in dark mode", () => {
    expect(cssRule(".dark .playsay-video-rail")).toContain("--playsay-video-chrome: #111111;");
    expect(cssRule(".dark .playsay-video-rail")).toContain("--playsay-video-tile: #202020;");
    expect(cssRule('.dark .playsay-classroom-room [data-lk-theme="default"]')).toContain("color-scheme: dark;");
  });

  it("keeps media letterboxing dark in either theme", () => {
    expect(cssRule('.playsay-video-focus > .lk-participant-tile .lk-participant-media-video[data-lk-source="camera"]')).toContain("background: #111111;");
    expect(cssRule('.playsay-video-focus > .lk-participant-tile .lk-participant-media-video[data-lk-source="screen_share"]')).toContain("background: #111111;");
  });
});
