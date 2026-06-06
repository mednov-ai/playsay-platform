import { describe, expect, it } from "vitest";
import { checkPassword } from "./passwordPolicy";

describe("registration password policy", () => {
  it("accepts passwords from 8 characters with enough variety", () => {
    expect(checkPassword("River2026!", "student@example.com", "Student").isValid).toBe(true);
  });

  it("rejects short, common, personal, and low-variety passwords", () => {
    expect(checkPassword("Short1!", "student@example.com").issues).toContain("tooShort");
    expect(checkPassword("password2026!", "student@example.com").issues).toContain("tooCommon");
    expect(checkPassword("Student2026!", "student@example.com", "Student").issues).toContain("containsEmail");
    expect(checkPassword("lowercase", "student@example.com").issues).toContain("needsVariety");
  });
});
