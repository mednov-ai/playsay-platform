import { createElement } from "react";
import { publicSiteUrl } from "@playsay/shared-ui";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProviders } from "./AppProviders";
import { WelcomeLanding } from "./AppShell";

describe("WelcomeLanding", () => {
  it("links the welcome logo and return action to the public Honey School website", () => {
    const markup = renderToStaticMarkup(createElement(
      AppProviders,
      null,
      createElement(WelcomeLanding, {
        profileSaving: false,
        status: "anonymous",
      }),
    ));

    expect(markup).toContain(`href="${publicSiteUrl}"`);
    expect(markup).toContain("playsay-welcome-return");
    expect(markup).toContain("/brand/logo/honey-school-logo.svg");
    expect(markup).not.toContain("playsay-official-logo.jpg");
  });
});
