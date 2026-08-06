import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyThemeMode, nextThemeMode, readStoredThemeMode, themeStorageKey } from "./index";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function createClassList() {
  const values = new Set<string>();
  return {
    contains: (name: string) => values.has(name),
    toggle: (name: string, enabled?: boolean) => {
      const shouldEnable = enabled ?? !values.has(name);
      if (shouldEnable) {
        values.add(name);
      } else {
        values.delete(name);
      }
      return shouldEnable;
    },
  };
}

describe("keyboard theme helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: new MemoryStorage(),
      matchMedia: undefined,
    });
    vi.stubGlobal("document", {
      documentElement: {
        classList: createClassList(),
        dataset: {},
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the shared Honey School theme storage key", () => {
    expect(themeStorageKey).toBe("playsay.theme");
  });

  it("falls back to system when local storage contains an unknown mode", () => {
    window.localStorage.setItem(themeStorageKey, "sepia");

    expect(readStoredThemeMode()).toBe("system");
  });

  it("applies dark mode through the document class and datasets", () => {
    const resolved = applyThemeMode("dark");

    expect(resolved).toBe("dark");
    expect(window.localStorage.getItem(themeStorageKey)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.resolvedTheme).toBe("dark");
  });

  it("cycles through system, light, and dark", () => {
    expect(nextThemeMode("system")).toBe("light");
    expect(nextThemeMode("light")).toBe("dark");
    expect(nextThemeMode("dark")).toBe("system");
  });
});
