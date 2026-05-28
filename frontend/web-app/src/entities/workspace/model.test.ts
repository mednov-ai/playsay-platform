import { describe, expect, it } from "vitest";
import { canAssignLessons, workspaceTabsForProfile } from "./model";
import type { MeProfile } from "../../shared/api/playsay";

function profileWithRoles(roles: string[]): MeProfile {
  return {
    roles,
    subject: "user-1",
    username: "user@example.com",
  } as MeProfile;
}

describe("workspace model", () => {
  it("allows teachers and admins to assign lessons", () => {
    expect(canAssignLessons(profileWithRoles(["STUDENT"]))).toBe(false);
    expect(canAssignLessons(profileWithRoles(["TEACHER"]))).toBe(true);
    expect(canAssignLessons(profileWithRoles(["ADMIN"]))).toBe(true);
  });

  it("keeps students on the schedule workspace only", () => {
    expect(workspaceTabsForProfile(profileWithRoles(["STUDENT"])).map((tab) => tab.id)).toEqual(["schedule"]);
    expect(workspaceTabsForProfile(profileWithRoles(["TEACHER"])).map((tab) => tab.id)).toEqual(["schedule", "materials", "courses"]);
  });
});
