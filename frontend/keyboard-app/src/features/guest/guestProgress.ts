export const guestSessionStorageKey = "playsay.key.guestSessions";
export const guestPromptDismissedStorageKey = "playsay.key.registrationPromptDismissedAt";
export const anonymousDeviceIdStorageKey = "playsay.key.anonymousDeviceId";
export const guestDisplayNameStorageKey = "playsay.key.guestDisplayName";

type GuestStorage = Pick<Storage, "getItem" | "setItem">;

export function browserStorage(): GuestStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readGuestSessionCount(storage: GuestStorage | null = browserStorage()): number {
  return readNonNegativeInt(storage?.getItem(guestSessionStorageKey));
}

export function readDismissedPromptCount(storage: GuestStorage | null = browserStorage()): number {
  return readNonNegativeInt(storage?.getItem(guestPromptDismissedStorageKey));
}

export function recordGuestSession(storage: GuestStorage | null = browserStorage()): number {
  const nextCount = readGuestSessionCount(storage) + 1;
  storage?.setItem(guestSessionStorageKey, String(nextCount));
  return nextCount;
}

export function getOrCreateAnonymousDeviceId(
  storage: GuestStorage | null = browserStorage(),
  idFactory: () => string = createAnonymousDeviceId,
): string {
  const existing = storage?.getItem(anonymousDeviceIdStorageKey);
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  const nextId = idFactory();
  storage?.setItem(anonymousDeviceIdStorageKey, nextId);
  return nextId;
}

export function readGuestDisplayName(storage: GuestStorage | null = browserStorage()): string | null {
  const value = storage?.getItem(guestDisplayNameStorageKey)?.trim();
  return value && value.length > 0 ? value : null;
}

export function writeGuestDisplayName(value: string, storage: GuestStorage | null = browserStorage()): string | null {
  const trimmed = value.trim().slice(0, 64);
  if (trimmed.length === 0) {
    return readGuestDisplayName(storage);
  }
  storage?.setItem(guestDisplayNameStorageKey, trimmed);
  return trimmed;
}

export function dismissRegistrationPrompt(count: number, storage: GuestStorage | null = browserStorage()): void {
  storage?.setItem(guestPromptDismissedStorageKey, String(Math.max(0, Math.floor(count))));
}

export function shouldShowRegistrationPrompt(sessionCount: number, dismissedCount: number): boolean {
  return sessionCount >= 5 && sessionCount % 5 === 0 && dismissedCount !== sessionCount;
}

export function shouldShowNamePrompt(sessionCount: number, displayName: string | null | undefined): boolean {
  return sessionCount >= 2 && !displayName?.trim();
}

function readNonNegativeInt(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function createAnonymousDeviceId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return `anon-${Date.now().toString(36)}-${random}`;
}
