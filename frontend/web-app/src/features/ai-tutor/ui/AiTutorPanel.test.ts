import { describe, expect, it } from "vitest";
import { agePolicyFromBirthDate } from "./AiTutorPanel";

describe("agePolicyFromBirthDate", () => {
  const today = new Date("2026-07-11T00:00:00Z");

  it("uses the profile birth date boundaries", () => {
    expect(agePolicyFromBirthDate("2014-07-12", today)).toBe("CHILD");
    expect(agePolicyFromBirthDate("2013-07-11", today)).toBe("TEEN");
    expect(agePolicyFromBirthDate("2008-07-11", today)).toBe("ADULT");
  });
});
