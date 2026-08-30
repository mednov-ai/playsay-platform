// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://online.honeyschool.ru/l#abcdefghijklmnop" }

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonAccessPage } from "./LessonAccessPage";

const apiMocks = vi.hoisted(() => ({
  startCompactLessonAccess: vi.fn(),
  startLessonAccess: vi.fn(),
}));

vi.mock("../../../shared/api/lessonAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/api/lessonAccess")>()),
  startCompactLessonAccess: apiMocks.startCompactLessonAccess,
  startLessonAccess: apiMocks.startLessonAccess,
}));
vi.mock("../../../shared/auth/oidc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/auth/oidc")>()),
  readTokens: () => null,
  startSilentLogin: vi.fn(),
}));
vi.mock("../../../app/AppProviders", () => ({
  useAppTheme: () => ({ mode: "system", resolvedTheme: "light", setMode: vi.fn() }),
}));
vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ i18n: { language: "ru" }, t: (key: string) => key }),
}));
vi.mock("../../../shared/i18n/ui/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("../../../shared/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

describe("LessonAccessPage compact entry", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/l#abcdefghijklmnop");
    window.sessionStorage.clear();
    window.sessionStorage.setItem("honey.lesson-access.silent:compact", "done");
    apiMocks.startCompactLessonAccess.mockResolvedValue({
      attemptId: "attempt-1",
      attemptSecret: "browser-secret",
      lessonId: "lesson-1",
      status: "CONFIRMATION_REQUIRED",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("captures and clears the alias fragment before resolving without a lesson id in the URL", async () => {
    render(<LessonAccessPage />);

    expect(window.location.hash).toBe("");
    await waitFor(() => expect(apiMocks.startCompactLessonAccess).toHaveBeenCalledWith("abcdefghijklmnop"));
    expect(apiMocks.startLessonAccess).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("honey.lesson-access.alias")).toBe("abcdefghijklmnop");
  });

  it("replaces the pending alias and restarts resolution when a new fragment arrives", async () => {
    render(<LessonAccessPage />);
    await waitFor(() => expect(apiMocks.startCompactLessonAccess).toHaveBeenCalledWith("abcdefghijklmnop"));
    await waitFor(() => expect(document.body.textContent).toContain("registration.lessonAccess.emailLabel"));

    act(() => {
      window.location.hash = "qrstuvwxyzABCDEF";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    await waitFor(() => expect(apiMocks.startCompactLessonAccess).toHaveBeenCalledWith("qrstuvwxyzABCDEF"));
    expect(window.location.hash).toBe("");
    expect(window.sessionStorage.getItem("honey.lesson-access.alias")).toBe("qrstuvwxyzABCDEF");
  });
});
