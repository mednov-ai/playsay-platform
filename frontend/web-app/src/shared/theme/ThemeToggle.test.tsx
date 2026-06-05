import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

vi.mock("../i18n", () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const values: Record<string, string> = {
        "shell.theme.system": "Системная",
        "shell.theme.light": "Светлая",
        "shell.theme.dark": "Темная",
      };
      if (key === "shell.theme.toggleAria") {
        return `Тема: ${options?.theme}`;
      }
      return values[key] ?? key;
    },
  }),
}));

describe("ThemeToggle", () => {
  it("renders an accessible localized theme control", () => {
    const markup = renderToStaticMarkup(<ThemeToggle mode="system" onModeChange={vi.fn()} />);

    expect(markup).toContain("aria-label=\"Тема: Системная\"");
    expect(markup).toContain("Системная");
  });

  it("cycles through system, light, and dark modes", () => {
    const onModeChange = vi.fn();

    const systemElement = ThemeToggle({ mode: "system", onModeChange });
    systemElement.props.onClick();
    expect(onModeChange).toHaveBeenLastCalledWith("light");

    const lightElement = ThemeToggle({ mode: "light", onModeChange });
    lightElement.props.onClick();
    expect(onModeChange).toHaveBeenLastCalledWith("dark");

    const darkElement = ThemeToggle({ mode: "dark", onModeChange });
    darkElement.props.onClick();
    expect(onModeChange).toHaveBeenLastCalledWith("system");
  });
});
