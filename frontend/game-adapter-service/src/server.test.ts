import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGameAdapterServer } from "./server.js";

const token = "test-game-adapter-service-token";

afterEach(() => {
  delete process.env.PLAY_SAY_GAME_ADAPTER_SERVICE_TOKEN;
  vi.restoreAllMocks();
});

describe("game adapter HTTP service", () => {
  it("returns safe aggregate optimization output without invoking adaptation", async () => {
    process.env.PLAY_SAY_GAME_ADAPTER_SERVICE_TOKEN = token;
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const adapt = vi.fn();
    const optimize = vi.fn(async (html: string) => ({
      html: html.replace("large", "small"),
      policy: "embedded-raster-v1" as const,
      status: "OPTIMIZED" as const,
      inputBytes: 18,
      outputBytes: 12,
      eligibleCount: 1,
      replacedCount: 1,
      bytesSaved: 6,
      durationMs: 4,
    }));
    const server = createGameAdapterServer(adapt, optimize).listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server address unavailable");
      const response = await fetch(`http://127.0.0.1:${address.port}/internal/html-game-optimizations`, {
        body: JSON.stringify({ html: "<html>large</html>", policy: "embedded-raster-v1" }),
        headers: {
          "Content-Type": "application/json",
          "X-PlaySay-Game-Adapter-Token": token,
        },
        method: "POST",
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ policy: "embedded-raster-v1", replacedCount: 1 });
      expect(optimize).toHaveBeenCalledWith("<html>large</html>", "embedded-raster-v1");
      expect(adapt).not.toHaveBeenCalled();
      const logOutput = info.mock.calls.flat().join(" ");
      expect(logOutput).toContain("html_game_image_optimization");
      expect(logOutput).not.toContain("<html>");
      expect(logOutput).not.toContain("large");
      expect(logOutput).not.toContain("small");
      expect(logOutput).not.toContain(token);
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("requires authentication and returns a retryable deadline failure", async () => {
    process.env.PLAY_SAY_GAME_ADAPTER_SERVICE_TOKEN = token;
    const optimize = vi.fn(() => new Promise<never>(() => undefined));
    const server = createGameAdapterServer(vi.fn(), optimize, 5).listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server address unavailable");
      const url = `http://127.0.0.1:${address.port}/internal/html-game-optimizations`;
      const unauthorized = await fetch(url, {
        body: JSON.stringify({ html: "<html></html>", policy: "embedded-raster-v1" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      expect(unauthorized.status).toBe(401);
      expect(optimize).not.toHaveBeenCalled();

      const timeout = await fetch(url, {
        body: JSON.stringify({ html: "<html></html>", policy: "embedded-raster-v1" }),
        headers: {
          "Content-Type": "application/json",
          "X-PlaySay-Game-Adapter-Token": token,
        },
        method: "POST",
      });
      expect(timeout.status).toBe(503);
      expect(await timeout.json()).toEqual({ code: "OPTIMIZATION_TIMEOUT", retryable: true });
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("keeps the optimization request ceiling at 24 MiB", async () => {
    process.env.PLAY_SAY_GAME_ADAPTER_SERVICE_TOKEN = token;
    const optimize = vi.fn();
    const server = createGameAdapterServer(vi.fn(), optimize).listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server address unavailable");
      const response = await fetch(`http://127.0.0.1:${address.port}/internal/html-game-optimizations`, {
        body: JSON.stringify({ html: "x".repeat(24 * 1024 * 1024), policy: "embedded-raster-v1" }),
        headers: {
          "Content-Type": "application/json",
          "X-PlaySay-Game-Adapter-Token": token,
        },
        method: "POST",
      });
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ code: "REQUEST_TOO_LARGE", retryable: false });
      expect(optimize).not.toHaveBeenCalled();
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("returns a validated adaptation through the internal endpoint", async () => {
    process.env.PLAY_SAY_GAME_ADAPTER_SERVICE_TOKEN = token;
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const adapt = vi.fn(async () => ({
      html: "<html>adapted</html>",
      model: "test",
      promptHash: "hash",
      report: "validated",
      sourceHash: "source-hash",
      validation: {
        actionCount: 1,
        attempts: 1,
        checks: ["manifest", "lifecycle-ready"],
        durationMs: 10,
        mechanicsEquivalent: true,
        maximumActionsPerSecond: 1,
        validatorVersion: "mechanics-v3" as const,
      },
      mediaProtection: {
        aiInputBytes: 128,
        extractedBytes: 2048,
        inputBytes: 2176,
        resourceCount: 2,
        status: "protected" as const,
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
      const logOutput = info.mock.calls.flat().join(" ");
      expect(logOutput).toContain("game_adaptation_media_protection");
      expect(logOutput).toContain('"resourceCount":2');
      expect(logOutput).not.toContain("<html>");
      expect(logOutput).not.toContain("base64");
      expect(logOutput).not.toContain("placeholder");
      expect(logOutput).not.toContain("digest");
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("returns and logs a safe terminal media-integrity failure", async () => {
    process.env.PLAY_SAY_GAME_ADAPTER_SERVICE_TOKEN = token;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const server = createGameAdapterServer(async () => {
      throw new Error("ADAPTED_HTML_VALIDATION_FAILED: ADAPTED_HTML_MEDIA_INTEGRITY_INVALID: placeholder missing");
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server address unavailable");
      const response = await fetch(`http://127.0.0.1:${address.port}/internal/game-adaptations`, {
        body: JSON.stringify({ html: "<html>sensitive base64 source</html>" }),
        headers: {
          "Content-Type": "application/json",
          "X-PlaySay-Game-Adapter-Token": token,
        },
        method: "POST",
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        code: "ADAPTED_HTML_MEDIA_INTEGRITY_INVALID",
        retryable: false,
      });
      const logOutput = warn.mock.calls.flat().join(" ");
      expect(logOutput).toContain("game_adaptation_media_protection_failed");
      expect(logOutput).not.toContain("sensitive");
      expect(logOutput).not.toContain("placeholder missing");
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
        validation: {
          failureCode: "ACTION_CONTRACT_INVALID",
          mechanicsEquivalent: false,
          validatorVersion: "mechanics-v3",
        },
      });
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("returns terminal mechanics divergence without retry", async () => {
    process.env.PLAY_SAY_GAME_ADAPTER_SERVICE_TOKEN = token;
    const server = createGameAdapterServer(async () => {
      throw new Error("ADAPTED_HTML_VALIDATION_FAILED: GAME_MECHANICS_CHANGED");
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
        code: "ADAPTED_HTML_MECHANICS_CHANGED",
        retryable: false,
        validation: {
          failureCode: "GAME_MECHANICS_CHANGED",
          mechanicsEquivalent: false,
          validatorVersion: "mechanics-v3",
        },
      });
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
