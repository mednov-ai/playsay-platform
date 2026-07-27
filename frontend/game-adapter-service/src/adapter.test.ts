import { describe, expect, it } from "vitest";
import { adaptGameHtml, validateAdaptedHtml } from "./adapter.js";

const manifest = `<script type="application/playsay-game+json">{
  "protocol":"playsay-game-sync/v1","gameId":"quiz","stateVersion":"1",
  "reducerVersion":"1","buildHash":"test"
}</script>`;

describe("game adapter", () => {
  it("injects the bundled SDK and validates a deterministic adaptation", async () => {
    const result = await adaptGameHtml("<html><head></head><body><button>Go</button></body></html>", {
      generate: async () => ({
        html: `<html><head><!-- PLAYSAY_GAME_SYNC_SDK -->${manifest}</head><body><script>
          PlaySayGameSync.defineGame({manifest:{},initialState:{},reduce:s=>s,onState:()=>{}})
        </script></body></html>`,
        report: "Converted button events to actions.",
      }),
      model: "test-model",
      sdkSource: "window.PlaySayGameSync={defineGame(){}};",
    });
    expect(result.html).toContain("data-playsay-game-sync-sdk");
    expect(result.report).toContain("actions");
    expect(result.promptHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects network access in generated games", () => {
    expect(() => validateAdaptedHtml(
      `<html><head>${manifest}</head><body><script>
        fetch('https://tracker.invalid'); PlaySayGameSync.defineGame({})
      </script></body></html>`,
    )).toThrow("ADAPTED_HTML_UNSAFE");
  });

  it("rejects dynamic execution and persistent tracking APIs", () => {
    for (const unsafe of ["eval('1')", "new Function('return 1')", "localStorage.setItem('x','1')"]) {
      expect(() => validateAdaptedHtml(
        `<html><head>${manifest}</head><body><script>
          ${unsafe}; PlaySayGameSync.defineGame({})
        </script></body></html>`,
      )).toThrow("ADAPTED_HTML_UNSAFE");
    }
  });
});
