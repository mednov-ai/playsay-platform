import type { LayoutId } from "../../shared/types";

export const guestSessionStorageKey = "playsay.key.guestSessions";
export const guestPromptDismissedStorageKey = "playsay.key.registrationPromptDismissedAt";
export const anonymousDeviceIdStorageKey = "playsay.key.anonymousDeviceId";
export const guestDisplayNameStorageKey = "playsay.key.guestDisplayName";
export const guestLayoutMasteryStorageKey = "playsay.key.layoutMastery";

type GuestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type GuestLayoutMastery = Partial<Record<LayoutId, { masteryCpm: number }>>;

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

export function readGuestLayoutMastery(storage: GuestStorage | null = browserStorage()): GuestLayoutMastery {
  const value = storage?.getItem(guestLayoutMasteryStorageKey);
  if (!value) {
    return {};
  }
  return sanitizeGuestLayoutMastery(value);
}

export function writeGuestLayoutMastery(
  layoutId: LayoutId,
  masteryCpm: number,
  storage: GuestStorage | null = browserStorage(),
): GuestLayoutMastery {
  const current = readGuestLayoutMastery(storage);
  const cleanMastery = Number.isFinite(masteryCpm) && masteryCpm > 0 ? Math.round(masteryCpm * 10) / 10 : 0;
  const next = {
    ...current,
    [layoutId]: { masteryCpm: cleanMastery },
  };
  storage?.setItem(guestLayoutMasteryStorageKey, JSON.stringify(next));
  return next;
}

export function dismissRegistrationPrompt(count: number, storage: GuestStorage | null = browserStorage()): void {
  storage?.setItem(guestPromptDismissedStorageKey, String(Math.max(0, Math.floor(count))));
}

export function clearGuestProgress(storage: GuestStorage | null = browserStorage()): void {
  [
    guestSessionStorageKey,
    guestPromptDismissedStorageKey,
    anonymousDeviceIdStorageKey,
    guestDisplayNameStorageKey,
    guestLayoutMasteryStorageKey,
  ].forEach((key) => storage?.removeItem(key));
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

function sanitizeGuestLayoutMastery(value: string): GuestLayoutMastery {
  try {
    const parsed = JSON.parse(value) as Record<string, { masteryCpm?: unknown }>;
    const next: GuestLayoutMastery = {};
    (["EN", "RU"] as const).forEach((layoutId) => {
      const masteryCpm = parsed[layoutId]?.masteryCpm;
      if (typeof masteryCpm === "number" && Number.isFinite(masteryCpm) && masteryCpm >= 0) {
        next[layoutId] = { masteryCpm };
      }
    });
    return next;
  } catch {
    return {};
  }
}

function createAnonymousDeviceId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return `anon-${Date.now().toString(36)}-${random}`;
}
