import { describe, expect, it } from "vitest";
import { matchesChatContact } from "./chatContactSearch";

describe("chat prefix search", () => {
  const contact = { subject: "allowed", displayName: "Мария Меднова", username: "maria.teacher", role: "TEACHER" as const };
  it("matches the first character of names and login regardless of case", () => {
    for (const query of ["м", " МЕД ", "M", "maria.t", "Мария Мед"]) {
      expect(matchesChatContact(contact, query, "ru")).toBe(true);
    }
    expect(matchesChatContact(contact, "ария", "ru")).toBe(false);
    expect(matchesChatContact(contact, "teacher", "en")).toBe(false);
  });
  it("supports empty search, missing usernames and normalized accented names", () => {
    expect(matchesChatContact(contact, "  ", "fr")).toBe(true);
    expect(matchesChatContact({ ...contact, username: null }, "m", "en")).toBe(false);
    expect(matchesChatContact({ ...contact, displayName: "Émile Dupont" }, "E\u0301", "fr")).toBe(true);
  });
});
