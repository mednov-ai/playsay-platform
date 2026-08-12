// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://online.honey.school/" }
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PasskeyPrompt } from "./PasskeyPrompt";

const startPasskeyRegistration = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../shared/api/playsay", () => ({
  startPasskeyRegistration: (...args: unknown[]) => startPasskeyRegistration(...args),
}));
vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({
    t: (key: string) => ({
      "profile.passkeys.configure": "Настроить ключ доступа",
      "profile.passkeys.later": "Не сейчас",
      "profile.passkeys.promptAria": "Предложение настроить ключ доступа",
      "profile.passkeys.promptDescription": "Описание",
      "profile.passkeys.promptTitle": "Вход без пароля",
    })[key] ?? key,
  }),
}));

describe("PasskeyPrompt", () => {
  beforeAll(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  beforeEach(() => {
    window.localStorage.clear();
    startPasskeyRegistration.mockClear();
  });

  it("offers setup once per user and starts the idempotent flow", () => {
    const { unmount } = render(<PasskeyPrompt passkeyCount={0} subject="student-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Настроить ключ доступа" }));
    expect(startPasskeyRegistration).toHaveBeenCalledWith({
      mode: "ensure",
      passkeyCountBefore: 0,
      returnPath: "/profile",
    });
    expect(window.localStorage.getItem("playsay.passkeyPrompt.v1")).toContain("student-1");

    unmount();
    render(<PasskeyPrompt passkeyCount={0} subject="student-1" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not prompt when a passkey already exists", () => {
    render(<PasskeyPrompt passkeyCount={1} subject="student-2" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
