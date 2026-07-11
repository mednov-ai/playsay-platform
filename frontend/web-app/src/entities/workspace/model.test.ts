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

  it("adds AI speaking practice to student and teacher workspaces", () => {
    expect(workspaceTabsForProfile(profileWithRoles(["STUDENT"])).map((tab) => tab.id)).toEqual(["schedule", "aiTutor", "homework"]);
    expect(workspaceTabsForProfile(profileWithRoles(["TEACHER"])).map((tab) => tab.id)).toEqual(["schedule", "aiTutor", "homework", "materials", "courses", "billing"]);
    expect(workspaceTabsForProfile(profileWithRoles(["STUDENT"]))[0].labelKey).toBe("workspace.tabs.mySchedule.label");
    expect(workspaceTabsForProfile(profileWithRoles(["TEACHER"]))[0].labelKey).toBe("workspace.tabs.schedule.label");
  });
});
