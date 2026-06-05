import { afterEach, describe, expect, it, vi } from "vitest";

describe("theme preferences", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("falls back to system for invalid stored values", async () => {
    const localStorage = createMemoryStorage({ "playsay.theme": "sepia" });
    vi.stubGlobal("window", createWindow({ localStorage, systemDark: false }));
    vi.stubGlobal("document", createDocument());

    const { readStoredThemeMode } = await import("./index");

    expect(readStoredThemeMode()).toBe("system");
  });

  it("resolves system mode from prefers-color-scheme", async () => {
    vi.stubGlobal("window", createWindow({ localStorage: createMemoryStorage(), systemDark: true }));
    vi.stubGlobal("document", createDocument());

    const { resolveTheme } = await import("./index");

    expect(resolveTheme("system")).toBe("dark");
  });

  it("keeps manual light and dark modes independent of the system theme", async () => {
    vi.stubGlobal("window", createWindow({ localStorage: createMemoryStorage(), systemDark: true }));
    vi.stubGlobal("document", createDocument());

    const { resolveTheme } = await import("./index");

    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("stores the selected mode and applies the dark class", async () => {
    const localStorage = createMemoryStorage();
    const document = createDocument();
    vi.stubGlobal("window", createWindow({ localStorage, systemDark: false }));
    vi.stubGlobal("document", document);

    const { applyThemeMode, themeStorageKey } = await import("./index");

    applyThemeMode("dark");

    expect(localStorage.getItem(themeStorageKey)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    applyThemeMode("light");

    expect(localStorage.getItem(themeStorageKey)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

function createMemoryStorage(initialValues: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initialValues));

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function createWindow({
  localStorage,
  systemDark,
}: {
  localStorage: Storage;
  systemDark: boolean;
}): Window {
  return {
    localStorage,
    matchMedia: (query: string) => ({
      addEventListener: vi.fn(),
      matches: query === "(prefers-color-scheme: dark)" ? systemDark : false,
      media: query,
      removeEventListener: vi.fn(),
    }),
  } as unknown as Window;
}

function createDocument(): Document {
  const classes = new Set<string>();

  return {
    documentElement: {
      classList: {
        add: (className: string) => classes.add(className),
        contains: (className: string) => classes.has(className),
        remove: (className: string) => classes.delete(className),
      },
    },
  } as unknown as Document;
}
