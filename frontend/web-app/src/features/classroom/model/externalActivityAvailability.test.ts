import { describe, expect, it } from "vitest";
import { externalActivityFeatureEnabled } from "./externalActivityAvailability";

describe("external activity build availability", () => {
  it("enables local development and explicitly enabled production builds", () => {
    expect(externalActivityFeatureEnabled({ DEV: true })).toBe(true);
    expect(externalActivityFeatureEnabled({ DEV: false, VITE_EXTERNAL_ACTIVITY_ENABLED: "true" })).toBe(true);
  });

  it("keeps an unavailable build distinguishable from an enabled build", () => {
    expect(externalActivityFeatureEnabled({ DEV: false })).toBe(false);
    expect(externalActivityFeatureEnabled({ DEV: false, VITE_EXTERNAL_ACTIVITY_ENABLED: "false" })).toBe(false);
  });
});
