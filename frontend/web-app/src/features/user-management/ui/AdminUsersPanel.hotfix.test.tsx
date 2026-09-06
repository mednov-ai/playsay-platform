// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../shared/api/errors";
import { i18n } from "../../../shared/i18n";
import { AdminUsersPanel, userManagementErrorKey } from "./AdminUsersPanel";
import { ErrorToastHost } from "../../../shared/ui/ErrorToast";
import * as userApi from "../api/userManagement";

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
  refresh: vi.fn(),
  extraUser: false,
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
      refreshAfterDeletion: mocks.refresh,
      revoke: mutation(),
      students: query([student]),
      translationPermission: mutation(),
      users: query(mocks.extraUser ? [student, { ...student, subject: "second", id: "second-id", displayName: "Second Learner" }] : [student]),
    };
  },
}));

describe("ADMIN + TEACHER user management hotfix", () => {
  beforeAll(async () => i18n.changeLanguage("ru"));

  afterEach(() => {
    cleanup();
    render(<ErrorToastHost />);
    for (const alert of screen.queryAllByRole("alert")) {
      const close = within(alert).queryByRole("button");
      if (close) fireEvent.click(close);
    }
    cleanup();
    vi.restoreAllMocks();
    mocks.assignTeacher.mockReset();
    mocks.removeUser.mockReset();
    mocks.refresh.mockReset();
    mocks.extraUser = false;
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
    const nativeConfirm = vi.spyOn(window, "confirm").mockImplementation(() => { throw new Error("unavailable"); });
    mocks.removeUser.mockRejectedValue(new ApiError(409, "USER_DELETE_REPLACEMENT_REQUIRED", "internal message"));
    render(<AdminUsersPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(mocks.removeUser).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(mocks.removeUser).toHaveBeenCalledWith({ subject: "student" }));
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(await screen.findByText("Выберите другого активного преподавателя для передачи зависимых данных.")).toBeVisible();
    expect(screen.queryByText("internal message")).not.toBeInTheDocument();
  });

  it("maps unknown errors to the generic localized failure", () => {
    expect(userManagementErrorKey(new ApiError(500, "UNKNOWN", "raw"))).toBe("userManagement.messages.actionFailed");
  });

  it("focuses cancel, supports Escape and restores focus without DELETE", () => {
    render(<AdminUsersPanel />);
    const trigger = screen.getByRole("button", { name: "Удалить" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: i18n.t("common.actions.cancel") })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(mocks.removeUser).not.toHaveBeenCalled();
  });

  it("serializes double confirmation and shows unknown outcome without retry", async () => {
    let reject!: (reason: unknown) => void;
    mocks.removeUser.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    render(<AdminUsersPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Удалить" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mocks.removeUser).toHaveBeenCalledTimes(1);
    reject(new ApiError(0, "NETWORK_ERROR", "raw"));
    expect(await screen.findByText(i18n.t("userManagement.deletion.unknown", { name: "Ученик" }))).toBeVisible();
    expect(mocks.removeUser).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: i18n.t("userManagement.deletion.check") })).not.toBeInTheDocument();
  });

  it.each(["ru", "en", "de", "fr"])("keeps completed deletion separate from refresh failure in %s", async (locale) => {
    await i18n.changeLanguage(locale);
    mocks.removeUser.mockResolvedValue({ operationId: "test-operation", targetSubject: "student", status: "COMPLETED" });
    mocks.refresh.mockRejectedValue(new Error("synthetic refresh failure"));
    render(<><AdminUsersPanel /><ErrorToastHost /></>);
    fireEvent.click(screen.getByRole("button", { name: i18n.t("userManagement.actions.delete") }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: i18n.t("userManagement.actions.delete") }));
    expect(await screen.findByText(i18n.t("userManagement.deletion.completed", { name: "Ученик" }))).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("userManagement.deletion.refreshFailed"));
    expect(mocks.removeUser).toHaveBeenCalledTimes(1);
    await i18n.changeLanguage("ru");
  });

  it("retains known operation after closing and rechecks with GET only", async () => {
    const operation: userApi.UserDeletionOperation = { operationId: "known-operation", targetSubject: "student", status: "RUNNING", errorCode: null, createdAt: "", updatedAt: "", completedAt: null };
    mocks.removeUser.mockResolvedValue(operation);
    vi.spyOn(userApi, "waitForUserDeletion").mockRejectedValueOnce(new ApiError(504, "USER_DELETE_TIMEOUT", "raw"));
    const getStatus = vi.spyOn(userApi, "fetchUserDeletionOperation").mockResolvedValue({ ...operation, status: "COMPLETED" });
    render(<AdminUsersPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Удалить" }));
    await screen.findByText(i18n.t("userManagement.deletion.unknown", { name: "Ученик" }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("userManagement.deletion.close") }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("userManagement.deletion.details") }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("userManagement.deletion.check") }));
    await screen.findByText(i18n.t("userManagement.deletion.completed", { name: "Ученик" }));
    expect(getStatus).toHaveBeenCalledWith("known-operation");
    expect(mocks.removeUser).toHaveBeenCalledTimes(1);
  });

  it("a late refresh failure cannot overwrite confirmation for another target", async () => {
    mocks.extraUser = true;
    mocks.removeUser.mockResolvedValue({ operationId: "completed", targetSubject: "student", status: "COMPLETED" });
    let rejectRefresh!: (reason: unknown) => void;
    mocks.refresh.mockImplementation(() => new Promise((_, reject) => { rejectRefresh = reject; }));
    render(<AdminUsersPanel />);
    fireEvent.click(screen.getAllByRole("button", { name: "Удалить" })[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Удалить" }));
    await screen.findByText(i18n.t("userManagement.deletion.completed", { name: "Ученик" }));
    fireEvent.click(screen.getByRole("button", { name: i18n.t("userManagement.deletion.close") }));
    const second = screen.getByRole("heading", { name: "Second Learner" }).closest("article") as HTMLElement;
    fireEvent.click(within(second).getByRole("button", { name: "Удалить" }));
    rejectRefresh(new Error("late refresh failure"));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent(i18n.t("userManagement.deletion.confirming", { name: "Second Learner" })));
    expect(mocks.removeUser).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "Удалить" })[0]).toBeDisabled();
  });

  it("shows a localized toast for a failed teacher assignment", async () => {
    await i18n.changeLanguage("de");
    mocks.assignTeacher.mockRejectedValue(new ApiError(403, "ADMIN_ROLE_REQUIRED", "raw backend text"));
    render(<><AdminUsersPanel /><ErrorToastHost /></>);
    const card = screen.getByRole("heading", { name: "Ученик" }).closest("article") as HTMLElement;
    fireEvent.change(within(card).getByLabelText(i18n.t("userManagement.fields.primaryTeacher")), { target: { value: "maria" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("userManagement.errors.adminRequired"));
    expect(screen.queryByText("raw backend text")).not.toBeInTheDocument();
    await i18n.changeLanguage("ru");
  });
});
