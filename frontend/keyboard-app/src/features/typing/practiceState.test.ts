import { describe, expect, it } from "vitest";
import type { ChordSet } from "../../shared/types";
import {
  clearPracticeState,
  practiceStateStorageKey,
  readPracticeState,
  writePracticeState,
  markPracticeIntroDismissed,
  resolvePersistedPracticeSet,
} from "./practiceState";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  length = 0;

  clear(): void {
    this.values.clear();
    this.length = 0;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
    this.length = this.values.size;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
    this.length = this.values.size;
  }
}

const sets: ChordSet[] = [
  { id: 1, layout: "EN", title: "EN 1", difficulty: 1, tier: "beginner", chords: ["th"] },
  { id: 2, layout: "EN", title: "EN 2", difficulty: 2, tier: "beginner", chords: ["er"] },
  { id: 5, layout: "RU", title: "RU 1", difficulty: 1, tier: "beginner", chords: ["ст"] },
];

const focusSet: ChordSet = {
  id: -1,
  sourceChordSetId: 2,
  focusProblemKeys: ["e"],
  layout: "EN",
  title: "Focus",
  difficulty: 0,
  tier: "beginner",
  chords: ["ee", "er"],
};

describe("persisted keyboard practice state", () => {
  it("stores active set, pending focus decision and intro state for one owner", () => {
    const storage = new MemoryStorage();

    writePracticeState(
      {
        ownerKey: "guest:device-a",
        layoutId: "EN",
        activeSetId: 2,
        pendingNext: { kind: "down", focusSet },
      },
      storage,
    );
    markPracticeIntroDismissed("guest:device-a", storage);

    expect(storage.getItem(practiceStateStorageKey)).toContain("\"ownerKey\":\"guest:device-a\"");
    expect(readPracticeState("guest:device-a", storage)).toMatchObject({
      layoutId: "EN",
      activeSetId: 2,
      introDismissed: true,
      pendingNext: {
        kind: "down",
        focusSet: {
          id: -1,
          sourceChordSetId: 2,
        },
      },
    });
  });

  it("ignores corrupt state and state for another owner", () => {
    const storage = new MemoryStorage();

    storage.setItem(practiceStateStorageKey, "{oops");
    expect(readPracticeState("guest:device-a", storage)).toBeNull();

    writePracticeState({ ownerKey: "guest:device-b", layoutId: "RU", activeSetId: 5 }, storage);
    expect(readPracticeState("guest:device-a", storage)).toBeNull();
  });

  it("prefers a pending next set over the previous active set after reload", () => {
    const state = {
      version: 1 as const,
      ownerKey: "guest:device-a",
      layoutId: "EN" as const,
      activeSetId: 1,
      pendingNext: { kind: "up" as const, setId: 2 },
    };

    expect(resolvePersistedPracticeSet(state, sets)?.id).toBe(2);
  });

  it("restores focus lessons and clears practice state during anonymous reset", () => {
    const storage = new MemoryStorage();

    writePracticeState(
      {
        ownerKey: "guest:device-a",
        layoutId: "EN",
        activeSetId: 1,
        pendingNext: { kind: "down", focusSet },
      },
      storage,
    );

    expect(resolvePersistedPracticeSet(readPracticeState("guest:device-a", storage), sets)?.id).toBe(-1);

    clearPracticeState(storage);
    expect(storage.getItem(practiceStateStorageKey)).toBeNull();
  });
});
