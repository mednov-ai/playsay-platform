import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGameAdapterServer } from "./server.js";

const token = "test-game-adapter-service-token";

afterEach(() => {
  delete process.env.PLAY_SAY_GAME_ADAPTER_SERVICE_TOKEN;
  vi.restoreAllMocks();
});

describe("game adapter HTTP service", () => {
  it("returns a validated adaptation through the internal endpoint", async () => {
    process.env.PLAY_SAY_GAME_ADAPTER_SERVICE_TOKEN = token;
    const adapt = vi.fn(async () => ({
      html: "<html>adapted</html>",
      model: "test",
      promptHash: "hash",
      report: "validated",
      validation: {
        actionCount: 1,
        attempts: 1,
        checks: ["manifest", "lifecycle-ready"],
        durationMs: 10,
        maximumActionsPerSecond: 1,
      },
    }));
    const server = createGameAdapterServer(adapt).listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server address unavailable");
      const response = await fetch(`http://127.0.0.1:${address.port}/internal/game-adaptations`, {
        body: JSON.stringify({ html: "<html>source</html>" }),
        headers: {
          "Content-Type": "application/json",
          "X-PlaySay-Game-Adapter-Token": token,
        },
        method: "POST",
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        html: "<html>adapted</html>",
        validation: { attempts: 1 },
      });
      expect(adapt).toHaveBeenCalledWith("<html>source</html>");
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("returns terminal contract failures without retry", async () => {
    process.env.PLAY_SAY_GAME_ADAPTER_SERVICE_TOKEN = token;
    const server = createGameAdapterServer(async () => {
      throw new Error("ADAPTED_HTML_VALIDATION_FAILED: ACTION_CONTRACT_INVALID");
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server address unavailable");
      const response = await fetch(`http://127.0.0.1:${address.port}/internal/game-adaptations`, {
        body: JSON.stringify({ html: "<html>source</html>" }),
        headers: {
          "Content-Type": "application/json",
          "X-PlaySay-Game-Adapter-Token": token,
        },
        method: "POST",
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        code: "ADAPTED_HTML_CONTRACT_INVALID",
        retryable: false,
      });
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
