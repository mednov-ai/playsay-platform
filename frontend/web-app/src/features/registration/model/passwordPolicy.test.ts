import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkPassword, passwordIssueReason, type PasswordReason } from "./passwordPolicy";

type PolicyFixture = {
  id: string;
  email: string;
  displayName?: string;
  password: string;
  padToLength?: number;
  padCharacter?: string;
  expectedReasons: PasswordReason[];
};

const fixtures = JSON.parse(readFileSync(
  new URL("../../../../../../contracts/registration-password-policy.json", import.meta.url),
  "utf8",
)) as PolicyFixture[];

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

  it.each(fixtures)("matches the shared policy fixture: $id", (fixture) => {
    const password = paddedPassword(fixture);
    const reasons = checkPassword(password, fixture.email, fixture.displayName).issues.map(passwordIssueReason);
    expect(reasons).toEqual(fixture.expectedReasons);
  });
});

function paddedPassword(fixture: PolicyFixture): string {
  if (fixture.padToLength == null) {
    return fixture.password;
  }
  const paddingLength = fixture.padToLength - fixture.password.length;
  if (paddingLength < 0) {
    throw new Error(`Fixture ${fixture.id} cannot shrink a password.`);
  }
  return fixture.password + (fixture.padCharacter ?? "x").repeat(paddingLength);
}
