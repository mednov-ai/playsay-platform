export const guestSessionStorageKey = "playsay.key.guestSessions";
export const guestPromptDismissedStorageKey = "playsay.key.registrationPromptDismissedAt";

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

export function dismissRegistrationPrompt(count: number, storage: GuestStorage | null = browserStorage()): void {
  storage?.setItem(guestPromptDismissedStorageKey, String(Math.max(0, Math.floor(count))));
}

export function shouldShowRegistrationPrompt(sessionCount: number, dismissedCount: number): boolean {
  return sessionCount >= 5 && sessionCount % 5 === 0 && dismissedCount !== sessionCount;
}

function readNonNegativeInt(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
