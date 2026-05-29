import { afterEach, describe, expect, it, vi } from "vitest";
import { i18nStorageKey } from "./languages";

describe("i18n config", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("syncs the document language when the app language changes", async () => {
    const localStorage = createMemoryStorage();
    const document = createDocument();

    vi.stubGlobal("window", {
      document,
      localStorage,
      navigator: { language: "ru-RU" },
    });

    const { changeAppLanguage } = await import("./config");

    await changeAppLanguage("fr-FR");

    expect(document.documentElement.lang).toBe("fr");
    expect(localStorage.getItem(i18nStorageKey)).toBe("fr");
  });
});

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

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

function createDocument(): Document {
  return {
    documentElement: {
      lang: "",
    },
  } as Document;
}
