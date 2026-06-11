import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { masteryLevelForCpm, StatsPanel } from "./StatsPanel";

describe("StatsPanel", () => {
  it("renders mastery before speed with the named mastery level", () => {
    const markup = renderToStaticMarkup(
      createElement(StatsPanel, {
        labels: {
          mastery: "Мастерство",
          speed: "Скорость",
          accuracy: "Точность",
          cadence: "Ритм",
          errors: "Ошибки",
          progress: "Прогресс",
        },
        units: {
          cpm: "зн/мин",
          percent: "%",
        },
        masteryCpm: 252,
        masteryLevel: "Средний",
        speedCpm: 210,
        accuracy: 0.96,
        cadence: 0.72,
        errors: 1,
        progress: 0.42,
      }),
    );

    expect(markup.indexOf("Мастерство")).toBeLessThan(markup.indexOf("Скорость"));
    expect(markup).toContain("252 зн/мин · Средний");
  });

  it("derives named mastery levels from mastery cpm thresholds", () => {
    expect(masteryLevelForCpm(0)).toBe("starter");
    expect(masteryLevelForCpm(99)).toBe("starter");
    expect(masteryLevelForCpm(100)).toBe("beginner");
    expect(masteryLevelForCpm(180)).toBe("confident");
    expect(masteryLevelForCpm(250)).toBe("middle");
    expect(masteryLevelForCpm(350)).toBe("strong");
    expect(masteryLevelForCpm(450)).toBe("pro");
  });
});
