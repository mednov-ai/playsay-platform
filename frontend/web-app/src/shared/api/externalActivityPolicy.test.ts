import { describe, expect, it } from "vitest";
import { isGuaranteedExternalActivityUrl } from "./externalActivityPolicy";

describe("external activity URL policy", () => {
  it("routes worksheet 710637 to External Activity without a provider fetch", () => {
    expect(isGuaranteedExternalActivityUrl("https://www.liveworksheets.com/worksheet/en/english-second-language-esl/710637")).toBe(true);
  });

  it("does not intercept arbitrary URL imports", () => {
    expect(isGuaranteedExternalActivityUrl("https://example.org/article")).toBe(false);
    expect(isGuaranteedExternalActivityUrl("http://liveworksheets.com/worksheet/710637")).toBe(false);
  });
});
