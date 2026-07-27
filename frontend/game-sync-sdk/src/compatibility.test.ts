import { describe, expect, it } from "vitest";
import { classifyGameHtml, readGameManifest } from "./compatibility";

describe("game compatibility", () => {
  it("recognizes the v1 embedded manifest", () => {
    const html = `<html><script type="application/playsay-game+json">{
      "protocol":"playsay-game-sync/v1","gameId":"quiz","stateVersion":"1",
      "reducerVersion":"1","buildHash":"abc"
    }</script></html>`;
    expect(classifyGameHtml(html)).toBe("SDK_V1");
    expect(readGameManifest(html)?.gameId).toBe("quiz");
  });

  it("routes network-dependent games to authority mirror", () => {
    expect(classifyGameHtml("<html><script>fetch('/score')</script></html>")).toBe("LEGACY_MIRROR");
  });

  it("keeps deterministic legacy games on predictive mode", () => {
    expect(classifyGameHtml("<html><button>Play</button></html>")).toBe("LEGACY_PREDICTIVE");
  });
});
