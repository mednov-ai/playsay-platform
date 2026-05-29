import { normalizeLanguage, type SupportedLanguage } from "./languages";

export const pendingLoginLanguageStorageKey = "playsay.pendingLoginLanguage";
export const pendingLoginLanguageCookieName = "playsay.pendingLoginLanguage";

export type AuthenticatedLanguageResolution = {
  language: SupportedLanguage | null;
  shouldSaveProfile: boolean;
};

export function rememberPendingLoginLanguage(language: string): SupportedLanguage {
  const normalizedLanguage = normalizeLanguage(language);

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(pendingLoginLanguageStorageKey, normalizedLanguage);
    writePendingLoginLanguageCookie(normalizedLanguage);
  }

  return normalizedLanguage;
}

export function consumePendingLoginLanguage(): SupportedLanguage | null {
  if (typeof window === "undefined") {
    return null;
  }

  const cookieLanguage = readCookie(pendingLoginLanguageCookieName);
  const language = window.sessionStorage.getItem(pendingLoginLanguageStorageKey);
  window.sessionStorage.removeItem(pendingLoginLanguageStorageKey);
  clearPendingLoginLanguageCookie();

  if (cookieLanguage) {
    return normalizeLanguage(cookieLanguage);
  }

  return language ? normalizeLanguage(language) : null;
}

export function resolveAuthenticatedLanguage({
  pendingLanguage,
  profileLocale,
}: {
  pendingLanguage: string | null;
  profileLocale: string | null | undefined;
}): AuthenticatedLanguageResolution {
  if (pendingLanguage) {
    const language = normalizeLanguage(pendingLanguage);
    const profileLanguage = profileLocale ? normalizeLanguage(profileLocale) : null;

    return {
      language,
      shouldSaveProfile: profileLanguage !== language,
    };
  }

  if (profileLocale) {
    return {
      language: normalizeLanguage(profileLocale),
      shouldSaveProfile: false,
    };
  }

  return {
    language: null,
    shouldSaveProfile: false,
  };
}

function writePendingLoginLanguageCookie(language: SupportedLanguage): void {
  const documentRef = window.document;
  if (!documentRef) {
    return;
  }

  documentRef.cookie = [
    `${pendingLoginLanguageCookieName}=${encodeURIComponent(language)}`,
    "Path=/",
    "Max-Age=600",
    "SameSite=Lax",
    sharedCookieDomainAttribute(),
    secureCookieAttribute(),
  ]
    .filter(Boolean)
    .join("; ");
}

function clearPendingLoginLanguageCookie(): void {
  const documentRef = window.document;
  if (!documentRef) {
    return;
  }

  const baseAttributes = [
    `${pendingLoginLanguageCookieName}=`,
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
    secureCookieAttribute(),
  ]
    .filter(Boolean)
    .join("; ");

  documentRef.cookie = baseAttributes;

  const sharedDomain = sharedCookieDomainAttribute();
  if (sharedDomain) {
    documentRef.cookie = `${baseAttributes}; ${sharedDomain}`;
  }
}

function readCookie(name: string): string | null {
  const documentRef = window.document;
  if (!documentRef) {
    return null;
  }

  const prefix = `${name}=`;
  const match = documentRef.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

function sharedCookieDomainAttribute(): string {
  const hostname = window.location?.hostname ?? "";
  return hostname === "play-and-say.ru" || hostname.endsWith(".play-and-say.ru")
    ? "Domain=.play-and-say.ru"
    : "";
}

function secureCookieAttribute(): string {
  return window.location?.protocol === "https:" ? "Secure" : "";
}
