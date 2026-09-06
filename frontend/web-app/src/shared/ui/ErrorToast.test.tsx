// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../i18n";
import { ErrorToastHost, showErrorToast } from "./ErrorToast";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
  });
});

afterEach(() => {
  for (const alert of screen.queryAllByRole("alert")) fireEvent.click(within(alert).getByRole("button"));
  cleanup();
});

describe("error notifications", () => {
  it.each(["ru", "en", "de", "fr"])("uses the selected %s locale, not raw server text", async (language) => {
    await i18n.changeLanguage(language);
    render(<ErrorToastHost />);
    act(() => showErrorToast(new Error("sensitive backend text"), "userManagement.errors.inProgressLesson"));
    expect(screen.getByRole("alert")).toHaveTextContent(i18n.t("userManagement.errors.inProgressLesson"));
    expect(screen.queryByText("sensitive backend text")).not.toBeInTheDocument();
    expect(screen.getByRole("alert").parentElement).toHaveClass("fixed", "bottom-4", "right-4");
  });

  it("deduplicates the same error and follows language changes", async () => {
    await i18n.changeLanguage("ru");
    render(<ErrorToastHost />);
    const error = new Error();
    act(() => {
      showErrorToast(error, "userManagement.messages.actionFailed");
      showErrorToast(error, "userManagement.messages.actionFailed");
    });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    await act(() => i18n.changeLanguage("fr"));
    expect(screen.getByRole("alert")).toHaveTextContent(i18n.t("userManagement.messages.actionFailed"));
  });
});
