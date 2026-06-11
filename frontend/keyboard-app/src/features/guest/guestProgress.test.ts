import { describe, expect, it } from "vitest";
import {
  anonymousDeviceIdStorageKey,
  guestDisplayNameStorageKey,
  guestLayoutMasteryStorageKey,
  guestPromptDismissedStorageKey,
  guestSessionStorageKey,
  getOrCreateAnonymousDeviceId,
  readGuestLayoutMastery,
  readGuestDisplayName,
  readDismissedPromptCount,
  readGuestSessionCount,
  recordGuestSession,
  shouldShowNamePrompt,
  shouldShowRegistrationPrompt,
  writeGuestDisplayName,
  writeGuestLayoutMastery,
} from "./guestProgress";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("guest keyboard progress", () => {
  it("uses the Play&Say key guest session storage contract", () => {
    expect(guestSessionStorageKey).toBe("playsay.key.guestSessions");
    expect(guestPromptDismissedStorageKey).toBe("playsay.key.registrationPromptDismissedAt");
    expect(anonymousDeviceIdStorageKey).toBe("playsay.key.anonymousDeviceId");
    expect(guestDisplayNameStorageKey).toBe("playsay.key.guestDisplayName");
    expect(guestLayoutMasteryStorageKey).toBe("playsay.key.layoutMastery");
  });

  it("creates a stable anonymous device id", () => {
    const storage = new MemoryStorage();
    const factory = () => "device-123";

    expect(getOrCreateAnonymousDeviceId(storage, factory)).toBe("device-123");
    expect(getOrCreateAnonymousDeviceId(storage, () => "device-456")).toBe("device-123");
    expect(storage.getItem(anonymousDeviceIdStorageKey)).toBe("device-123");
  });

  it("increments anonymous completed sessions", () => {
    const storage = new MemoryStorage();

    expect(readGuestSessionCount(storage)).toBe(0);
    expect(recordGuestSession(storage)).toBe(1);
    expect(recordGuestSession(storage)).toBe(2);
    expect(readGuestSessionCount(storage)).toBe(2);
  });

  it("prompts softly on every fifth anonymous session unless that count was dismissed", () => {
    expect(shouldShowRegistrationPrompt(4, 0)).toBe(false);
    expect(shouldShowRegistrationPrompt(5, 0)).toBe(true);
    expect(shouldShowRegistrationPrompt(5, 5)).toBe(false);
    expect(shouldShowRegistrationPrompt(6, 5)).toBe(false);
    expect(shouldShowRegistrationPrompt(10, 5)).toBe(true);
  });

  it("prompts for a guest name after two sessions until a name exists", () => {
    expect(shouldShowNamePrompt(1, null)).toBe(false);
    expect(shouldShowNamePrompt(2, null)).toBe(true);
    expect(shouldShowNamePrompt(3, "Masha")).toBe(false);
  });

  it("stores a trimmed guest display name and ignores empty values", () => {
    const storage = new MemoryStorage();

    writeGuestDisplayName("  Masha  ", storage);
    expect(readGuestDisplayName(storage)).toBe("Masha");

    writeGuestDisplayName("   ", storage);
    expect(readGuestDisplayName(storage)).toBe("Masha");
  });

  it("overwrites a saved guest display name when the user edits it", () => {
    const storage = new MemoryStorage();

    writeGuestDisplayName("Masha", storage);
    writeGuestDisplayName("Zhenya", storage);

    expect(readGuestDisplayName(storage)).toBe("Zhenya");
  });

  it("stores guest mastery separately for each layout", () => {
    const storage = new MemoryStorage();

    writeGuestLayoutMastery("EN", 212.34, storage);
    writeGuestLayoutMastery("RU", 88.2, storage);

    expect(readGuestLayoutMastery(storage)).toEqual({
      EN: { masteryCpm: 212.3 },
      RU: { masteryCpm: 88.2 },
    });
  });

  it("treats invalid stored values as empty", () => {
    const storage = new MemoryStorage();
    storage.setItem(guestSessionStorageKey, "oops");
    storage.setItem(guestPromptDismissedStorageKey, "-1");

    expect(readGuestSessionCount(storage)).toBe(0);
    expect(readDismissedPromptCount(storage)).toBe(0);
  });
});
