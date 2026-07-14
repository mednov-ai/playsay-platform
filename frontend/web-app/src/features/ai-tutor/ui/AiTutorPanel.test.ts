import { describe, expect, it } from "vitest";
import { dialogRemainingSeconds, agePolicyFromBirthDate } from "./AiTutorPanel";

describe("agePolicyFromBirthDate", () => {
  const today = new Date("2026-07-11T00:00:00Z");

  it("uses the profile birth date boundaries", () => {
    expect(agePolicyFromBirthDate("2014-07-12", today)).toBe("CHILD");
    expect(agePolicyFromBirthDate("2013-07-11", today)).toBe("TEEN");
    expect(agePolicyFromBirthDate("2008-07-11", today)).toBe("ADULT");
  });
});

describe("dialogRemainingSeconds", () => {
  it("uses the absolute server expiry and never becomes negative", () => {
    const expiresAt = "2026-07-14T12:10:00.000Z";

    expect(dialogRemainingSeconds(expiresAt, Date.parse("2026-07-14T12:00:00.000Z"))).toBe(600);
    expect(dialogRemainingSeconds(expiresAt, Date.parse("2026-07-14T12:09:59.400Z"))).toBe(1);
    expect(dialogRemainingSeconds(expiresAt, Date.parse("2026-07-14T12:10:01.000Z"))).toBe(0);
    expect(dialogRemainingSeconds(null)).toBeNull();
  });
});
