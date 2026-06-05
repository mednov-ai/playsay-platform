import { describe, expect, it } from "vitest";
import {
  guestPromptDismissedStorageKey,
  guestSessionStorageKey,
  readDismissedPromptCount,
  readGuestSessionCount,
  recordGuestSession,
  shouldShowRegistrationPrompt,
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

  it("treats invalid stored values as empty", () => {
    const storage = new MemoryStorage();
    storage.setItem(guestSessionStorageKey, "oops");
    storage.setItem(guestPromptDismissedStorageKey, "-1");

    expect(readGuestSessionCount(storage)).toBe(0);
    expect(readDismissedPromptCount(storage)).toBe(0);
  });
});
