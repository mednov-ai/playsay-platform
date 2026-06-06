import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RegistrationRateLimitDialog } from "./RegistrationPage";

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
