import { createElement } from "react";
import { publicSiteUrl } from "@playsay/shared-ui";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";

describe("AuthGate", () => {
  it("links the brand to the public Honey School website", () => {
    const markup = renderToStaticMarkup(createElement(AuthGate, {
      status: "idle",
      language: "en",
      languages: {
        ru: "Русский",
        en: "English",
        de: "Deutsch",
        fr: "Français",
      },
      languageLabel: "Language",
      themeMode: "light",
      themeLabels: {
        system: "System",
        light: "Light",
        dark: "Dark",
      },
      title: "Honey School Key",
      product: "Key",
      publicSiteAriaLabel: "Open the main Honey School website",
      signInLabel: "Sign in",
      loadingLabel: "Loading",
      callbackLabel: "Returning",
      errorLabel: "Sign-in failed",
      retryLabel: "Retry",
      onLanguageChange: vi.fn(),
      onThemeChange: vi.fn(),
      onSignIn: vi.fn(),
    }));

    expect(markup).toContain(`href="${publicSiteUrl}"`);
    expect(markup).toContain("aria-label=\"Open the main Honey School website\"");
    expect(markup).toContain("/brand/logo/honey-school-logo.svg");
  });
});
