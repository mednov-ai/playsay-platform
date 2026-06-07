import { createElement } from "react";
import { publicSiteUrl } from "@playsay/shared-ui";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  RegistrationConfirmActions,
  RegistrationRateLimitDialog,
  RegistrationStartSuccessDialog,
} from "./RegistrationPage";

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
