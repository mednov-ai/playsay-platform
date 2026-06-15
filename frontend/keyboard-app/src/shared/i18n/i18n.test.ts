import { describe, expect, it } from "vitest";
import { i18n } from "./config";
import { resources } from "./resources";

describe("keyboard i18n resources", () => {
  it("localizes the inline errors unit used by stat cards", () => {
    expect(resources.ru.translation.units.errors).toBe("раз");
    expect(resources.en.translation.units.errors).toBe("times");
    expect(resources.de.translation.units.errors).toBe("mal");
    expect(resources.fr.translation.units.errors).toBe("fois");
  });

  it("resolves nested unit keys instead of rendering raw translation keys", async () => {
    await i18n.changeLanguage("ru");

    expect(i18n.t("units.errors")).toBe("раз");
  });
});
