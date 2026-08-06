import { createElement } from "react";
import { publicSiteUrl } from "@playsay/shared-ui";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicPaymentReturnLink } from "./PublicPaymentPage";

describe("PublicPaymentReturnLink", () => {
  it("links failed public payment states back to the public Honey School website", () => {
    const markup = renderToStaticMarkup(createElement(PublicPaymentReturnLink, {
      label: "Back to website",
    }));

    expect(markup).toContain(`href="${publicSiteUrl}"`);
    expect(markup).toContain("Back to website");
  });
});
