// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://online.honeyschool.ru/l#abcdefghijklmnop" }

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonAccessPage } from "./LessonAccessPage";

const apiMocks = vi.hoisted(() => ({
  startCompactLessonAccess: vi.fn(),
  startLessonAccess: vi.fn(),
  resumeRememberedLessonAccess: vi.fn(),
  requestLessonEmailCode: vi.fn(),
  requestLessonLobby: vi.fn(),
  tokens: null as { accessToken: string; idToken: string } | null,
}));

vi.mock("../../../shared/api/lessonAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/api/lessonAccess")>()),
  startCompactLessonAccess: apiMocks.startCompactLessonAccess,
  startLessonAccess: apiMocks.startLessonAccess,
  resumeRememberedLessonAccess: apiMocks.resumeRememberedLessonAccess,
  requestLessonEmailCode: apiMocks.requestLessonEmailCode,
  requestLessonLobby: apiMocks.requestLessonLobby,
}));
vi.mock("../../../shared/auth/oidc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../shared/auth/oidc")>()),
  readTokens: () => apiMocks.tokens,
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
    apiMocks.requestLessonEmailCode.mockResolvedValue({ status: "CODE_SENT_IF_ELIGIBLE" });
    apiMocks.requestLessonLobby.mockResolvedValue({ status: "WAITING_FOR_TEACHER" });
  });

  afterEach(() => {
    cleanup();
    apiMocks.tokens = null;
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

  it("shows that the shared link is accepted while requiring email or teacher proof", async () => {
    render(<LessonAccessPage />);

    expect(await screen.findByText("registration.lessonAccess.linkAccepted")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "registration.lessonAccess.sendCode" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "registration.lessonAccess.noEmail" })).toBeEnabled();
    expect(apiMocks.resumeRememberedLessonAccess).not.toHaveBeenCalled();
  });

  it("keeps automatic entry for a matching authenticated session", async () => {
    apiMocks.tokens = activeTokens("assigned@example.test");
    apiMocks.resumeRememberedLessonAccess.mockResolvedValue({
      attemptId: "attempt-1",
      lessonId: "lesson-1",
      status: "AUTHENTICATED_READY",
    });

    render(<LessonAccessPage />);

    await waitFor(() => expect(apiMocks.resumeRememberedLessonAccess).toHaveBeenCalledWith(
      "lesson-1",
      "attempt-1",
      "browser-secret",
    ));
    expect(screen.queryByText("registration.lessonAccess.accountMismatch")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("honey.lesson-access.alias")).toBeNull();
  });

  it("surfaces an active-account mismatch without hiding alternative confirmation actions", async () => {
    apiMocks.tokens = activeTokens("different@example.test");
    apiMocks.resumeRememberedLessonAccess.mockRejectedValue(new Error("HTTP 404"));

    render(<LessonAccessPage />);

    expect(await screen.findByText("registration.lessonAccess.accountMismatch")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "registration.lessonAccess.notMe" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "registration.lessonAccess.sendCode" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "registration.lessonAccess.noEmail" })).toBeEnabled();
    expect(document.body.textContent).not.toContain("assigned@example.test");
  });

  it("keeps verified-email and teacher-Lobby confirmation usable", async () => {
    render(<LessonAccessPage />);
    await screen.findByText("registration.lessonAccess.linkAccepted");

    fireEvent.change(screen.getByLabelText("registration.lessonAccess.emailLabel"), {
      target: { value: "learner@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "registration.lessonAccess.sendCode" }));
    await waitFor(() => expect(apiMocks.requestLessonEmailCode).toHaveBeenCalledTimes(1));

    cleanup();
    window.history.replaceState({}, "", "/l#abcdefghijklmnop");
    window.sessionStorage.clear();
    window.sessionStorage.setItem("honey.lesson-access.silent:compact", "done");
    render(<LessonAccessPage />);
    await screen.findByText("registration.lessonAccess.linkAccepted");
    fireEvent.click(screen.getByRole("button", { name: "registration.lessonAccess.noEmail" }));
    fireEvent.change(screen.getByLabelText("registration.lessonAccess.lobbyLabel"), {
      target: { value: "Learner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "registration.lessonAccess.askTeacher" }));
    await waitFor(() => expect(apiMocks.requestLessonLobby).toHaveBeenCalledTimes(1));
  });
});

function activeTokens(email: string) {
  const payload = btoa(JSON.stringify({ email })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return { accessToken: "test-access", idToken: `header.${payload}.signature` };
}
