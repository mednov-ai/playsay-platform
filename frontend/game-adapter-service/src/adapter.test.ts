import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { adaptGameHtml, validateAdaptedHtml } from "./adapter.js";
import { closeRuntimeValidator } from "./runtime-validator.js";

const manifest = `<script type="application/playsay-game+json">{
  "protocol":"playsay-game-sync/v1","gameId":"quiz","stateVersion":"1",
  "reducerVersion":"1","buildHash":"test"
}</script>`;
const validationPlan = {
  readySelector: "#go",
  steps: [{
    expectActionType: "START",
    expectDomChange: true,
    name: "start",
    operation: { key: null, kind: "click" as const, selector: "#go" },
  }],
};
const runtimeValidation = {
  actionCount: 1,
  checks: ["manifest", "hello", "interactive-actions"],
  durationMs: 12,
  maximumActionsPerSecond: 1,
};

describe("game adapter", () => {
  it("injects the bundled SDK and validates a deterministic adaptation", async () => {
    const result = await adaptGameHtml("<html><head></head><body><button>Go</button></body></html>", {
      generate: async () => ({
        html: `<html><head><!-- PLAYSAY_GAME_SYNC_SDK -->${manifest}</head><body><button id="go">Go</button><script>
          PlaySayGameSync.defineGame({manifest:{},initialState:{},reduce:s=>s,onState:()=>{}})
        </script></body></html>`,
        report: "Converted button events to actions.",
        validationPlan,
      }),
      model: "test-model",
      sdkSource: "window.PlaySayGameSync={defineGame(){}};",
      validateRuntime: async () => runtimeValidation,
    });
    expect(result.html).toContain("data-playsay-game-sync-sdk");
    expect(result.report).toContain("actions");
    expect(result.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.validation.attempts).toBe(1);
  });

  it("repairs an invalid manifest once before accepting a validated result", async () => {
    const prompts: string[] = [];
    let generated = 0;
    const result = await adaptGameHtml("<html><body><button>Go</button></body></html>", {
      generate: async (prompt) => {
        prompts.push(prompt);
        generated += 1;
        return {
          html: `<html><head><!-- PLAYSAY_GAME_SYNC_SDK --><script type="application/playsay-game+json">{
            "protocol":"playsay-game-sync/v1","gameId":"quiz","stateVersion":${generated === 1 ? "1" : "\"1\""},
            "reducerVersion":"1","buildHash":"test","capabilities":["actions"]
          }</script></head><body><button id="go">Go</button><script>
            PlaySayGameSync.defineGame({manifest:{},initialState:{},reduce:s=>s,onState:()=>{}})
          </script></body></html>`,
          report: "Converted.",
          validationPlan,
        };
      },
      sdkSource: "window.PlaySayGameSync={defineGame(){}};",
      validateRuntime: async () => runtimeValidation,
    });
    expect(result.validation.attempts).toBe(2);
    expect(prompts[1]).toContain("ADAPTED_HTML_INVALID_MANIFEST");
  });

  it("rejects the invalid manifest shape found by the dev audit", () => {
    expect(() => validateAdaptedHtml(`<html><head><script type="application/playsay-game+json">{
      "protocol":"playsay-game-sync/v1","gameId":"quiz","stateVersion":1,
      "reducerVersion":"1","buildHash":"test","capabilities":{"actions":true}
    }</script></head><body><script>PlaySayGameSync.defineGame({})</script></body></html>`))
      .toThrow("ADAPTED_HTML_INVALID_MANIFEST");
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

  it.runIf(Boolean(process.env.CHROMIUM_EXECUTABLE_PATH))(
    "passes a generated interactive game through the real adapter and Chromium validator",
    async () => {
      const sdkSource = await readFile(
        new URL("../../game-sync-sdk/dist/game-sync.iife.js", import.meta.url),
        "utf8",
      );
      const adaptedHtml = `<html><head><!-- PLAYSAY_GAME_SYNC_SDK -->${manifest}</head>
        <body><button id="go">Go</button><output id="state">idle</output><script>
          const manifest = {
            protocol: "playsay-game-sync/v1",
            gameId: "quiz",
            stateVersion: "1",
            reducerVersion: "1",
            buildHash: "test"
          };
          const output = document.querySelector("#state");
          const controller = PlaySayGameSync.defineGame({
            manifest,
            initialState: { started: false },
            reduce(state, action) {
              return action.type === "START" ? { started: true } : state;
            },
            onState(state) {
              output.textContent = state.started ? "running" : "idle";
            }
          });
          document.querySelector("#go").addEventListener("click", () => controller.dispatch("START", {}));
          controller.ready();
        </script></body></html>`;

      try {
        const result = await adaptGameHtml(
          "<html><body><button>Legacy start</button></body></html>",
          {
            generate: async () => ({
              html: adaptedHtml,
              report: "Converted start to a semantic action.",
              validationPlan,
            }),
            model: "fixture",
            sdkSource,
          },
        );

        expect(result.validation.actionCount).toBe(1);
        expect(result.validation.checks).toContain("lifecycle-ready");
        expect(result.report).toContain("Validation passed");
      } finally {
        await closeRuntimeValidator();
      }
    },
    20_000,
  );
});
