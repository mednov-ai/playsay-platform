import { describe, expect, it } from "vitest";
import type { ChordSet } from "../../shared/types";
import { shouldReloadActiveSetForLayout } from "./activeSetSync";

const enSet: ChordSet = {
  id: 1,
  layout: "EN",
  title: "EN",
  difficulty: 1,
  tier: "beginner",
  chords: ["th"],
};

describe("active keyboard set sync", () => {
  it("does not reload a stale set after the layout has changed", () => {
    expect(shouldReloadActiveSetForLayout({ layoutId: "RU", chordSet: enSet, phase: "idle" })).toBe(false);
  });

  it("reloads a matching idle set when measured capacity changes", () => {
    expect(shouldReloadActiveSetForLayout({ layoutId: "EN", chordSet: enSet, phase: "idle" })).toBe(true);
  });

  it("does not reload while a session is locked", () => {
    expect(shouldReloadActiveSetForLayout({ layoutId: "EN", chordSet: enSet, phase: "countdown" })).toBe(false);
  });
});
