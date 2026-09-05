// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../shared/api/errors";
import { i18n } from "../../../shared/i18n";
import { AdminUsersPanel, userManagementErrorKey } from "./AdminUsersPanel";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

const mocks = vi.hoisted(() => ({
  assignTeacher: vi.fn(),
  removeUser: vi.fn(),
}));

vi.mock("../api/useUserManagementData", () => ({
  useAdminManagementData: () => {
    const query = (data: unknown) => ({ data, error: null, isFetching: false, refetch: vi.fn() });
    const mutation = (mutateAsync = vi.fn()) => ({ error: null, isPending: false, mutateAsync, variables: undefined });
    const maria = { displayName: "Мария", subject: "maria" };
    const student = {
      activeDelegates: [],
      displayName: "Ученик",
      email: "student@example.com",
      id: "student-id",
      lessonTranslationAllowed: false,
      primaryTeacher: null,
      roles: ["STUDENT"],
      status: "ACTIVE",
      subject: "student",
      username: "student",
    };
    return {
      addUser: mutation(),
      assignTeacher: mutation(mocks.assignTeacher),
      changeRoles: mutation(),
      delegate: mutation(),
      delegations: query([]),
      directory: query([maria]),
      removeUser: mutation(mocks.removeUser),
      revoke: mutation(),
      students: query([student]),
      translationPermission: mutation(),
      users: query([student]),
    };
  },
}));

describe("ADMIN + TEACHER user management hotfix", () => {
  beforeAll(async () => i18n.changeLanguage("ru"));

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mocks.assignTeacher.mockReset();
    mocks.removeUser.mockReset();
  });

  it("offers Maria as primary teacher and assigns her to the student", async () => {
    mocks.assignTeacher.mockResolvedValue(undefined);
    render(<AdminUsersPanel />);

    const userCard = screen.getByRole("heading", { name: "Ученик" }).closest("article");
    expect(userCard).not.toBeNull();
    const primaryTeacher = within(userCard as HTMLElement).getByLabelText("Основной преподаватель");
    expect(within(primaryTeacher).getByRole("option", { name: "Мария" })).toHaveValue("maria");

    fireEvent.change(primaryTeacher, { target: { value: "maria" } });

    await waitFor(() => expect(mocks.assignTeacher).toHaveBeenCalledWith({ studentSubject: "student", teacherSubject: "maria" }));
    expect(await screen.findByText("Основной преподаватель обновлён.")).toBeVisible();
  });

  it("confirms deletion and reports a safe replacement error", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.removeUser.mockRejectedValue(new ApiError(409, "USER_DELETE_REPLACEMENT_REQUIRED", "internal message"));
    render(<AdminUsersPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(mocks.removeUser).toHaveBeenCalledWith({ replacementTeacherSubject: undefined, subject: "student" }));
    expect(await screen.findByText("Выберите другого активного преподавателя для передачи зависимых данных.")).toBeVisible();
    expect(screen.queryByText("internal message")).not.toBeInTheDocument();
  });

  it("maps unknown errors to the generic localized failure", () => {
    expect(userManagementErrorKey(new ApiError(500, "UNKNOWN", "raw"))).toBe("userManagement.messages.actionFailed");
  });
});
