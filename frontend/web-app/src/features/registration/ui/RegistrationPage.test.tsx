// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { publicSiteUrl } from "@playsay/shared-ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RegistrationPage,
  RegistrationConfirmActions,
  RegistrationRateLimitDialog,
  RegistrationStartSuccessDialog,
} from "./RegistrationPage";

const i18nMock = vi.hoisted(() => {
  const translations: Record<string, string> = {
    "auth.login": "Sign in",
    "registration.start.title": "Create account",
    "registration.start.subtitle": "Register for Honey School",
    "registration.form.email": "Email",
    "registration.form.password": "Password",
    "registration.form.confirmPassword": "Repeat password",
    "registration.form.displayName": "Lesson name",
    "registration.actions.create": "Create account",
    "registration.actions.creating": "Creating account",
    "registration.actions.forgotPassword": "Forgot password?",
    "registration.actions.checkEmailPage": "Go to confirmation",
    "registration.password.tooShort": "At least 8 characters",
    "registration.password.tooLong": "No more than 128 characters",
    "registration.password.tooCommon": "Avoid obvious words and Honey School",
    "registration.password.containsEmail": "Does not contain part of the email",
    "registration.password.containsName": "Does not contain the lesson name",
    "registration.password.needsVariety": "Uses mixed case, digits, or symbols",
    "registration.password.match": "Passwords match",
    "registration.password.satisfied": "Done",
    "registration.password.notSatisfied": "Not met",
    "registration.validation.summary": "Correct the details to create your account",
    "registration.validation.emailRequired": "Enter your email.",
    "registration.validation.emailInvalid": "Enter a valid email.",
    "registration.validation.passwordRequired": "Enter a password.",
    "registration.validation.passwordInvalid": "Meet every password requirement.",
    "registration.validation.passwordConfirmRequired": "Repeat the password.",
    "registration.validation.passwordMismatch": "The passwords do not match.",
    "registration.messages.contractRejected": "The details were not accepted.",
    "registration.messages.unavailable": "Registration is temporarily unavailable.",
    "registration.messages.startFailed": "Could not start registration.",
    "registration.rateLimit.title": "Too many attempts",
    "registration.rateLimit.body": "Please wait and try again.",
    "registration.startSuccess.title": "Email sent",
    "registration.startSuccess.body": "Open the email to confirm the account.",
    "common.actions.close": "Close",
    "welcome.returnToSite": "Back to website",
  };
  return { translate: (key: string) => translations[key] ?? key };
});

vi.mock("../../../shared/i18n", () => ({
  i18n: { language: "en", t: i18nMock.translate },
  useAppTranslation: () => ({ i18n: { language: "en" }, t: i18nMock.translate }),
}));

vi.mock("../../../shared/i18n/ui/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("../../../shared/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));

vi.mock("../../../app/AppProviders", () => ({
  useAppTheme: () => ({
    mode: "system",
    resolvedTheme: "light",
    setMode: vi.fn(),
  }),
}));

beforeEach(() => {
  window.history.replaceState({}, "", "/register");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RegistrationPage start form", () => {
  it("keeps Create account operable and focuses the first required field", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<RegistrationPage route={{ kind: "start" }} />);

    const submit = screen.getByRole("button", { name: "Create account" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Correct the details to create your account");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("identifies password mismatch without sending a request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<RegistrationPage route={{ kind: "start" }} />);

    fillStartForm({ passwordConfirm: "River2026?" });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Repeat password")).toHaveFocus();
    expect(screen.getAllByText("The passwords do not match.")).toHaveLength(2);
  });

  it("links the summary to the malformed field and preserves entered values", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<RegistrationPage route={{ kind: "start" }} />);

    fillStartForm({ email: "not-an-email" });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    const emailInput = screen.getByLabelText("Email");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(emailInput).toHaveAttribute("aria-describedby", "registration-email-error");
    expect(screen.getByLabelText("Password")).toHaveValue("River2026!");
    fireEvent.click(screen.getByRole("link", { name: "Enter a valid email." }));
    expect(emailInput).toHaveFocus();
  });

  it.each([
    [400, "The details were not accepted."],
    [503, "Registration is temporarily unavailable."],
    [500, "Could not start registration."],
  ])("maps HTTP %i to safe registration copy", async (status, expectedMessage) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status }));
    render(<RegistrationPage route={{ kind: "start" }} />);

    fillStartForm();
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form") as HTMLFormElement);

    expect(await screen.findByText(expectedMessage)).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveValue("learner@example.test");
  });

  it("shows the safe rate-limit dialog", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 429 }));
    render(<RegistrationPage route={{ kind: "start" }} />);

    fillStartForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Too many attempts");
    expect(screen.queryByText(/HTTP 429/u)).not.toBeInTheDocument();
  });

  it("shows a name-fragment blocker with non-color status", () => {
    render(<RegistrationPage route={{ kind: "start" }} />);

    fillStartForm({ displayName: "Winter_Garden", password: "Garden2026!", passwordConfirm: "Garden2026!" });

    const rule = screen.getByText("Does not contain the lesson name").closest("li");
    expect(rule).toHaveAttribute("data-status", "not-satisfied");
    expect(within(rule as HTMLElement).getByText("Not met")).toBeVisible();
  });

  it("sends exactly one request while a valid submission is in flight", async () => {
    let resolveRequest!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    render(<RegistrationPage route={{ kind: "start" }} />);

    fillStartForm();
    const submit = screen.getByRole("button", { name: "Create account" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();

    resolveRequest(new Response(JSON.stringify({ status: "CHECK_EMAIL" }), {
      headers: { "Content-Type": "application/json" },
      status: 202,
    }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Email sent"));
  });
});

function fillStartForm(overrides: Partial<{
  displayName: string;
  email: string;
  password: string;
  passwordConfirm: string;
}> = {}) {
  const values = {
    displayName: "Learner",
    email: "learner@example.test",
    password: "River2026!",
    passwordConfirm: "River2026!",
    ...overrides,
  };
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: values.email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: values.password } });
  fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: values.passwordConfirm } });
  fireEvent.change(screen.getByLabelText("Lesson name"), { target: { value: values.displayName } });
}


describe("RegistrationRateLimitDialog", () => {
  it("renders a modal dialog for registration rate limits", () => {
    const markup = renderToStaticMarkup(createElement(RegistrationRateLimitDialog, {
      body: "Please wait and try again.",
      closeLabel: "Close",
      onClose: vi.fn(),
      open: true,
      title: "Too many attempts",
    }));

    expect(markup).toContain("role=\"dialog\"");
    expect(markup).toContain("aria-modal=\"true\"");
    expect(markup).toContain("Too many attempts");
    expect(markup).toContain("Please wait and try again.");
  });

  it("does not render while closed", () => {
    const markup = renderToStaticMarkup(createElement(RegistrationRateLimitDialog, {
      body: "Please wait and try again.",
      closeLabel: "Close",
      onClose: vi.fn(),
      open: false,
      title: "Too many attempts",
    }));

    expect(markup).toBe("");
  });
});

describe("RegistrationStartSuccessDialog", () => {
  it("renders a modal after a registration email is sent", () => {
    const markup = renderToStaticMarkup(createElement(RegistrationStartSuccessDialog, {
      body: "Open your mailbox and confirm the account.",
      checkEmailHref: "/register/check-email?email=student%40example.com&returnTo=https%3A%2F%2Fkey.play-and-say.ru%2F",
      closeLabel: "Close",
      continueLabel: "Continue",
      onClose: vi.fn(),
      open: true,
      returnToSiteHref: publicSiteUrl,
      returnToSiteLabel: "Back to website",
      title: "Confirmation email sent",
    }));

    expect(markup).toContain("role=\"dialog\"");
    expect(markup).toContain("Confirmation email sent");
    expect(markup).toContain("Open your mailbox and confirm the account.");
    expect(markup).toContain("/register/check-email?email=student%40example.com&amp;returnTo=https%3A%2F%2Fkey.play-and-say.ru%2F");
    expect(markup).toContain(`href="${publicSiteUrl}"`);
    expect(markup).toContain("Back to website");
  });
});

describe("RegistrationConfirmActions", () => {
  it("uses the continue url as the primary action when registration came from keyboard", () => {
    const markup = renderToStaticMarkup(createElement(RegistrationConfirmActions, {
      continueUrl: "https://key.play-and-say.ru/",
      continueLabel: "Open trainer",
      loading: false,
      signInLabel: "Sign in",
      onSignIn: vi.fn(),
    }));

    expect(markup).toContain("href=\"https://key.play-and-say.ru/\"");
    expect(markup.indexOf("Open trainer")).toBeLessThan(markup.indexOf("Sign in"));
  });
});
