import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import {
  adaptGameHtml,
  assertStaticMechanicsPreserved,
  validateAdaptedHtml,
} from "./adapter.js";
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
  mechanicsEquivalent: true,
  maximumActionsPerSecond: 1,
  validatorVersion: "mechanics-v3" as const,
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

  it("keeps threshold-triggering Donut-shaped image and audio payloads out of the AI prompt", async () => {
    const imagePayload = "A".repeat(300 * 1024);
    const audioPayload = "B".repeat(32 * 1024);
    const imageUri = `data:image/webp;base64,${imagePayload}`;
    const audioUri = `data:audio/mpeg;base64,${audioPayload}`;
    const source = `<html><head></head><body><img id="donut" src="${imageUri}"><audio src="${audioUri}"></audio></body></html>`;
    let runtimeCandidate = "";
    let runtimeSource = "";

    const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        input: Array<{ content: Array<{ text: string }> }>;
      };
      const prompt = request.input[1]?.content[0]?.text ?? "";
        expect(prompt).not.toContain(imagePayload);
        expect(prompt).not.toContain(audioPayload);
        const tokens = prompt.match(/playsay-media-placeholder:v1:[0-9]+:[0-9a-f-]+/gu) ?? [];
        expect(tokens).toHaveLength(2);
      return new Response(JSON.stringify({
        output: [{ content: [{ text: JSON.stringify({
          html: `<html><head><!-- PLAYSAY_GAME_SYNC_SDK -->${manifest}</head><body><img id="donut" src="${tokens[0]}"><audio src="${tokens[1]}"></audio><button id="go">Go</button><script>PlaySayGameSync.defineGame({manifest:{},initialState:{},reduce:s=>s,onState:()=>{}})</script></body></html>`,
          report: "Added synchronized actions.",
          validationPlan,
        }), type: "output_text" }] }],
      }), { headers: { "Content-Type": "application/json" }, status: 200 });
    });

    const result = await adaptGameHtml(source, {
      apiKey: "test-key",
      baseUrl: "https://provider.invalid/v1",
      model: "test-model",
      sdkSource: "window.PlaySayGameSync={defineGame(){}};",
      validateRuntime: async (candidate, _plan, original) => {
        runtimeCandidate = candidate;
        runtimeSource = original ?? "";
        return runtimeValidation;
      },
    });

    expect(provider).toHaveBeenCalledTimes(1);
    expect(runtimeCandidate).toContain(imageUri);
    expect(runtimeCandidate).toContain(audioUri);
    expect(runtimeSource).toBe(source);
    expect(result.html).toContain(imageUri);
    expect(result.html).toContain(audioUri);
    expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.mediaProtection).toMatchObject({ resourceCount: 2, status: "protected" });
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
    )).toThrow("ADAPTED_HTML_UNSAFE: network-api");
  });

  it("rejects dynamic execution and persistent tracking APIs", () => {
    for (const [unsafe, reason] of [
      ["eval('1')", "dynamic-code"],
      ["new Function('return 1')", "dynamic-code"],
      ["localStorage.setItem('x','1')", "persistent-storage"],
    ]) {
      expect(() => validateAdaptedHtml(
        `<html><head>${manifest}</head><body><script>
          ${unsafe}; PlaySayGameSync.defineGame({})
        </script></body></html>`,
      )).toThrow(`ADAPTED_HTML_UNSAFE: ${reason}`);
    }
  });

  it("rejects an adaptation that changes original CSS mechanics", () => {
    expect(() => assertStaticMechanicsPreserved(
      "<html><head><style>.gate{animation:move 10s linear}</style></head><body></body></html>",
      "<html><head><style>.gate{animation:move 4s linear}</style></head><body></body></html>",
    )).toThrow("GAME_MECHANICS_CHANGED");
  });

  it.runIf(Boolean(process.env.CHROMIUM_EXECUTABLE_PATH))(
    "passes a generated interactive game through the real adapter and Chromium validator",
    async () => {
      const sdkSource = await readFile(
        new URL("../../game-sync-sdk/dist/game-sync.iife.js", import.meta.url),
        "utf8",
      );
      const pixels = Buffer.alloc(640 * 640 * 3);
      let random = 0x12345678;
      for (let index = 0; index < pixels.length; index += 1) {
        random ^= random << 13;
        random ^= random >>> 17;
        random ^= random << 5;
        pixels[index] = random & 0xff;
      }
      const imageUri = `data:image/webp;base64,${(
        await sharp(pixels, { raw: { channels: 3, height: 640, width: 640 } }).webp({ lossless: true }).toBuffer()
      ).toString("base64")}`;
      const audioUri = `data:audio/wav;base64,${Buffer.alloc(48 * 1024).toString("base64")}`;
      expect(Buffer.byteLength(imageUri)).toBeGreaterThan(256 * 1024);
      const sourceHtml = `<html><body><img src="${imageUri}"><audio src="${audioUri}"></audio><button id="go">Go</button><output id="state">idle</output><script>
        document.querySelector("#go").addEventListener("click", () => {
          document.querySelector("#state").textContent = "running";
        });
      </script></body></html>`;

      try {
        const result = await adaptGameHtml(
          sourceHtml,
          {
            generate: async (prompt) => {
              expect(prompt).not.toContain(imageUri);
              expect(prompt).not.toContain(audioUri);
              const tokens = prompt.match(/playsay-media-placeholder:v1:[0-9]+:[0-9a-f-]+/gu) ?? [];
              expect(tokens).toHaveLength(2);
              return {
                html: `<html><head><!-- PLAYSAY_GAME_SYNC_SDK -->${manifest}</head>
                  <body><img src="${tokens[0]}"><audio src="${tokens[1]}"></audio><button id="go">Go</button><output id="state">idle</output><script>
                    const manifest = {
                      protocol: "playsay-game-sync/v1", gameId: "quiz", stateVersion: "1",
                      reducerVersion: "1", buildHash: "test"
                    };
                    const output = document.querySelector("#state");
                    const controller = PlaySayGameSync.defineGame({
                      manifest, initialState: { started: false },
                      reduce(state, action) { return action.type === "START" ? { started: true } : state; },
                      onState(state) { output.textContent = state.started ? "running" : "idle"; }
                    });
                    document.querySelector("#go").addEventListener("click", () => controller.dispatch("START", {}));
                    controller.ready();
                  </script></body></html>`,
                report: "Converted start to a semantic action.",
                validationPlan,
              };
            },
            model: "fixture",
            sdkSource,
          },
        );

        expect(result.validation.actionCount).toBe(1);
        expect(result.validation.checks).toContain("lifecycle-ready");
        expect(result.report).toContain("Validation passed");
        expect(result.html).toContain(imageUri);
        expect(result.html).toContain(audioUri);
      } finally {
        await closeRuntimeValidator();
      }
    },
    20_000,
  );
});
