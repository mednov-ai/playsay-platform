import { describe, expect, it } from "vitest";
import { getPrimaryRole, getRoleSummary, getRoleWorkspace } from "./role-workspace";

describe("role workspace helpers", () => {
  it("prioritizes admin before teacher and student", () => {
    expect(getPrimaryRole(["STUDENT", "ADMIN", "TEACHER"])).toBe("ADMIN");
    expect(getRoleWorkspace(["STUDENT", "ADMIN"]).titleKey).toBe("workspace.roles.admin.title");
  });

  it("uses teacher workspace for teacher users", () => {
    expect(getPrimaryRole(["STUDENT", "TEACHER"])).toBe("TEACHER");
    expect(getRoleWorkspace(["TEACHER"]).titleKey).toBe("workspace.roles.teacher.title");
  });

  it("falls back to student workspace and readable role summary", () => {
    expect(getPrimaryRole([])).toBe("STUDENT");
    expect(getRoleWorkspace([]).titleKey).toBe("workspace.roles.student.title");
    expect(getRoleSummary([])).toBe("workspace.roles.unassigned");
    expect(getRoleSummary(["STUDENT"])).toBe("STUDENT");
  });
});
