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
          errors: "раз",
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
    expect(markup).toContain('class="stats-panel__mastery-card');
    expect(markup).toContain('class="stats-panel__mastery-icon');
    expect(markup).toContain('class="stats-panel__mastery-value-line');
    expect(markup).toContain('class="stats-panel__mastery-level"');
    expect(markup).toContain('class="stats-panel__metrics');
    expect(markup).toContain('class="stat__number');
    expect(markup).toContain('class="stat__suffix');
    expect(markup).not.toContain('class="stat__unit-line');
    expect(markup).toContain('class="stats-panel__bar-value"');
    expect(markup.match(/<span class="stat__number/g)?.length).toBe(6);
    expect(markup.match(/<span class="stat__suffix/g)?.length).toBe(6);
    expect(markup.match(/stat__suffix--unit/g)?.length).toBe(3);
    expect(markup).toContain(">зн/мин</span>");
    expect(markup).toContain(">раз</span>");
    expect(markup).toContain('<span class="stats-panel__bar-value">42%</span>');
    expect(markup).toContain('aria-label="252 зн/мин · Средний"');
    expect(markup).toContain('aria-label="210 зн/мин"');
    expect(markup).toContain('aria-label="96%"');
    expect(markup).toContain('aria-label="1 раз"');
    expect(markup).toContain('aria-label="42%"');
  });

  it("can merge the current set header into the stats module", () => {
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
          errors: "раз",
        },
        currentLabel: "Текущий набор",
        currentTitle: "EN · Пары букв · домашний ряд",
        currentHint: "Тренируем частые пары букв.",
        actions: createElement("button", { type: "button" }, "Старт"),
        masteryCpm: 155,
        masteryLevel: "Начинающий",
        speedCpm: 0,
        accuracy: 1,
        cadence: 1,
        errors: 0,
        progress: 0,
      }),
    );

    expect(markup).toContain('class="stats-panel__top"');
    expect(markup).toContain('class="stats-panel__mastery-card"');
    expect(markup).toContain('class="stats-panel__set-card"');
    expect(markup).not.toContain('class="stats-panel__mastery-rail"');
    expect(markup).not.toContain('class="stats-panel__set-rail"');
    expect(markup).toContain('class="stats-panel__set-icon"');
    expect(markup).toContain('class="stats-panel__set-copy"');
    expect(markup).toContain('class="stats-panel__actions-card"');
    expect(markup).toContain('class="stats-panel__actions"');
    expect(markup.indexOf("Мастерство")).toBeLessThan(markup.indexOf("EN · Пары букв · домашний ряд"));
    expect(markup).not.toContain("Тренируем частые пары букв.");
    expect(markup).toContain(">Старт</button>");
  });

  it("renders an empty mastery placeholder before live bootstrap has enough chords", () => {
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
          errors: "раз",
        },
        masteryCpm: null,
        masteryLevel: "Стартовый",
        speedCpm: 80,
        accuracy: 1,
        cadence: 1,
        errors: 0,
        progress: 0.05,
      }),
    );

    expect(markup).toContain('aria-label="— зн/мин · Стартовый"');
    expect(markup).not.toContain("0 зн/мин · Стартовый");
  });

  it("derives named mastery levels from mastery cpm thresholds", () => {
    expect(masteryLevelForCpm(0)).toBe("starter");
    expect(masteryLevelForCpm(79)).toBe("starter");
    expect(masteryLevelForCpm(80)).toBe("beginner");
    expect(masteryLevelForCpm(159)).toBe("beginner");
    expect(masteryLevelForCpm(160)).toBe("confident");
    expect(masteryLevelForCpm(170)).toBe("confident");
    expect(masteryLevelForCpm(240)).toBe("middle");
    expect(masteryLevelForCpm(320)).toBe("strong");
    expect(masteryLevelForCpm(420)).toBe("pro");
  });

  it("renders a focused practice stats variant with animated numeric values", () => {
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
          errors: "раз",
        },
        masteryCpm: 170,
        masteryLevel: "Уверенный",
        speedCpm: 188,
        accuracy: 0.97,
        cadence: 0.72,
        errors: 2,
        progress: 0.5,
        variant: "practice",
      }),
    );

    expect(markup).toContain("stats-panel--practice");
    expect(markup).toContain("stat__value--animated");
    expect(markup).toContain('aria-label="170 зн/мин · Уверенный"');
  });
});
