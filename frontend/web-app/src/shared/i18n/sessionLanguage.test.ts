import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumePendingLoginLanguage,
  pendingLoginLanguageCookieName,
  pendingLoginLanguageStorageKey,
  rememberPendingLoginLanguage,
  resolveAuthenticatedLanguage,
} from "./sessionLanguage";

describe("session language handoff", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the pre-login language once and marks the profile for sync", () => {
    expect(
      resolveAuthenticatedLanguage({
        pendingLanguage: "en",
        profileLocale: "ru",
      }),
    ).toEqual({
      language: "en",
      shouldSaveProfile: true,
    });
  });

  it("keeps the profile locale when there is no pre-login language", () => {
    expect(
      resolveAuthenticatedLanguage({
        pendingLanguage: null,
        profileLocale: "de-DE",
      }),
    ).toEqual({
      language: "de",
      shouldSaveProfile: false,
    });
  });

  it("stores the pre-login language only until it is consumed", () => {
    const sessionStorage = createMemoryStorage();
    const document = createCookieDocument();
    vi.stubGlobal("window", {
      document,
      location: { hostname: "online.play-and-say.ru", protocol: "https:" },
      sessionStorage,
    });

    expect(rememberPendingLoginLanguage("fr-FR")).toBe("fr");
    expect(sessionStorage.getItem(pendingLoginLanguageStorageKey)).toBe("fr");
    expect(consumePendingLoginLanguage()).toBe("fr");
    expect(sessionStorage.getItem(pendingLoginLanguageStorageKey)).toBeNull();
    expect(consumePendingLoginLanguage()).toBeNull();
  });

  it("consumes the Keycloak-selected language from the shared login cookie", () => {
    const sessionStorage = createMemoryStorage();
    const document = createCookieDocument(`${pendingLoginLanguageCookieName}=en`);
    vi.stubGlobal("window", {
      document,
      location: { hostname: "online.play-and-say.ru", protocol: "https:" },
      sessionStorage,
    });

    expect(consumePendingLoginLanguage()).toBe("en");
    expect(document.cookie).not.toContain(pendingLoginLanguageCookieName);
  });

  it("prefers the Keycloak-selected cookie over the pre-login language", () => {
    const sessionStorage = createMemoryStorage();
    sessionStorage.setItem(pendingLoginLanguageStorageKey, "en");
    const document = createCookieDocument(`${pendingLoginLanguageCookieName}=de`);
    vi.stubGlobal("window", {
      document,
      location: { hostname: "online.play-and-say.ru", protocol: "https:" },
      sessionStorage,
    });

    expect(consumePendingLoginLanguage()).toBe("de");
    expect(sessionStorage.getItem(pendingLoginLanguageStorageKey)).toBeNull();
    expect(document.cookie).not.toContain(pendingLoginLanguageCookieName);
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

function createCookieDocument(initialCookie = ""): Document {
  let cookie = initialCookie;

  return {
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      const cookiePair = value.split(";")[0] ?? "";
      const cookieName = cookiePair.split("=")[0];
      if (value.includes("Max-Age=0")) {
        cookie = cookie
          .split(";")
          .map((part) => part.trim())
          .filter((part) => part && !part.startsWith(`${cookieName}=`))
          .join("; ");
        return;
      }
      cookie = cookiePair;
    },
  } as Document;
}
