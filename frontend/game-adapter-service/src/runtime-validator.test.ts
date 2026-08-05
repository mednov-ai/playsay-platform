import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  closeRuntimeValidator,
  validateGameRuntime,
  validateRuntimePlan,
} from "./runtime-validator.js";

describe("runtime validation plan", () => {
  it("accepts a bounded semantic interaction plan", () => {
    expect(validateRuntimePlan({
      readySelector: "#start",
      steps: [{
        expectActionType: "START",
        expectDomChange: true,
        name: "start race",
        operation: { kind: "click", selector: "#start" },
      }],
    })).toEqual({
      readySelector: "#start",
      steps: [{
        expectActionType: "START",
        expectDomChange: true,
        name: "start race",
        operation: { kind: "click", selector: "#start" },
      }],
    });
  });

  it("rejects missing actions and unsafe selector text", () => {
    expect(() => validateRuntimePlan({
      readySelector: "#start",
      steps: [],
    })).toThrow("VALIDATION_PLAN_INVALID");
    expect(() => validateRuntimePlan({
      readySelector: "button; script {}",
      steps: [{
        expectActionType: "START",
        expectDomChange: true,
        name: "start",
        operation: { kind: "click", selector: "#start" },
      }],
    })).toThrow("VALIDATION_PLAN_INVALID");
  });

  it("requires every check to observe a DOM change", () => {
    expect(() => validateRuntimePlan({
      readySelector: "#start",
      steps: [{
        expectActionType: "START",
        expectDomChange: false,
        name: "start",
        operation: { kind: "click", selector: "#start" },
      }],
    })).toThrow("VALIDATION_PLAN_INVALID");
  });

  it.runIf(Boolean(process.env.CHROMIUM_EXECUTABLE_PATH))(
    "starts an offline SDK game and observes its semantic action",
    async () => {
      const sdk = await readFile(new URL("../../game-sync-sdk/dist/game-sync.iife.js", import.meta.url), "utf8");
      const manifest = {
        buildHash: "validator-test",
        capabilities: ["actions"] as const,
        gameId: "validator-test",
        protocol: "playsay-game-sync/v1" as const,
        reducerVersion: "1",
        stateVersion: "1",
      };
      const html = `<html><head>
        <script type="application/playsay-game+json">${JSON.stringify(manifest)}</script>
      </head><body>
        <button id="start">Start</button><output id="state">idle</output>
        <script>${sdk}</script>
        <script>
          const output = document.querySelector("#state");
          const controller = PlaySayGameSync.defineGame({
            initialState: { started: false },
            manifest: ${JSON.stringify(manifest)},
            onState(state) { output.textContent = state.started ? "running" : "idle"; },
            reduce(state, action) {
              return action.type === "START" ? { started: true } : state;
            }
          });
          document.querySelector("#start").addEventListener("click", () => controller.dispatch("START", {}));
          controller.ready();
        </script>
      </body></html>`;

      try {
        const result = await validateGameRuntime(html, {
          readySelector: "#start",
          steps: [{
            expectActionType: "START",
            expectDomChange: true,
            name: "start",
            operation: { kind: "click", selector: "#start" },
          }],
        });
        expect(result.actionCount).toBe(1);
        expect(result.checks).toContain("lifecycle-ready");
        expect(result.mechanicsEquivalent).toBe(true);
      } finally {
        await closeRuntimeValidator();
      }
    },
    20_000,
  );

  it.runIf(Boolean(process.env.CHROMIUM_EXECUTABLE_PATH))(
    "rejects a candidate whose state transition differs from the source game",
    async () => {
      const sdk = await readFile(new URL("../../game-sync-sdk/dist/game-sync.iife.js", import.meta.url), "utf8");
      const gameManifest = {
        buildHash: "mechanics-test",
        capabilities: ["actions"] as const,
        gameId: "mechanics-test",
        protocol: "playsay-game-sync/v1" as const,
        reducerVersion: "1",
        stateVersion: "1",
      };
      const source = `<html><body>
        <button id="move">Move</button><output id="position">0</output>
        <script>
          document.querySelector("#move").addEventListener("click", () => {
            const output = document.querySelector("#position");
            output.textContent = String(Number(output.textContent) + 1);
          });
        </script>
      </body></html>`;
      const candidate = `<html><head>
        <script type="application/playsay-game+json">${JSON.stringify(gameManifest)}</script>
      </head><body>
        <button id="move">Move</button><output id="position">0</output>
        <script>${sdk}</script>
        <script>
          const output = document.querySelector("#position");
          const controller = PlaySayGameSync.defineGame({
            initialState: 0,
            manifest: ${JSON.stringify(gameManifest)},
            onState(state) { output.textContent = String(state); },
            reduce(state, action) { return action.type === "MOVE" ? state + 2 : state; }
          });
          document.querySelector("#move").addEventListener("click", () => controller.dispatch("MOVE", {}));
          controller.ready();
        </script>
      </body></html>`;
      const plan = {
        readySelector: "#move",
        steps: [{
          expectActionType: "MOVE",
          expectDomChange: true,
          name: "move",
          operation: { kind: "click" as const, selector: "#move" },
        }],
      };

      try {
        await expect(validateGameRuntime(candidate, plan, source))
          .rejects.toThrow("GAME_MECHANICS_CHANGED");
      } finally {
        await closeRuntimeValidator();
      }
    },
    20_000,
  );
});
