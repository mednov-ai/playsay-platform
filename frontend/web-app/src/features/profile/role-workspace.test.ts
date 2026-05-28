import { describe, expect, it } from "vitest";
import { getPrimaryRole, getRoleSummary, getRoleWorkspace } from "./role-workspace";

describe("role workspace helpers", () => {
  it("prioritizes admin before teacher and student", () => {
    expect(getPrimaryRole(["STUDENT", "ADMIN", "TEACHER"])).toBe("ADMIN");
    expect(getRoleWorkspace(["STUDENT", "ADMIN"]).title).toBe("Пользователи");
  });

  it("uses teacher workspace for teacher users", () => {
    expect(getPrimaryRole(["STUDENT", "TEACHER"])).toBe("TEACHER");
    expect(getRoleWorkspace(["TEACHER"]).title).toBe("Группы");
  });

  it("falls back to student workspace and readable role summary", () => {
    expect(getPrimaryRole([])).toBe("STUDENT");
    expect(getRoleWorkspace([]).title).toBe("Мои занятия");
    expect(getRoleSummary([])).toBe("роль ещё не назначена");
    expect(getRoleSummary(["STUDENT"])).toBe("STUDENT");
  });
});
