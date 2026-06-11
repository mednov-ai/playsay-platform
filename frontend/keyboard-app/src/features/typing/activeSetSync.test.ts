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

  it("reloads a matching countdown set before typing is accepted", () => {
    expect(shouldReloadActiveSetForLayout({ layoutId: "EN", chordSet: enSet, phase: "countdown" })).toBe(true);
  });

  it("does not reload while a session has user input state", () => {
    expect(shouldReloadActiveSetForLayout({ layoutId: "EN", chordSet: enSet, phase: "running" })).toBe(false);
    expect(shouldReloadActiveSetForLayout({ layoutId: "EN", chordSet: enSet, phase: "paused" })).toBe(false);
    expect(shouldReloadActiveSetForLayout({ layoutId: "EN", chordSet: enSet, phase: "finished" })).toBe(false);
  });
});
