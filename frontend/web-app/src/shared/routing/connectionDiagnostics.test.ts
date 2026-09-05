// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { diagnosticsShortcut, observeConnection, connectionObservations, publicEndpoint, observeSessionPolicy, installConnectionObservation } from "./connectionDiagnostics";

describe("connection diagnostic boundary", () => {
  it("keeps only declared public hosts, discarding credentials and paths", () => {
    expect(publicEndpoint("wss://dev.online.honeyschool.ru/collab/ws?token=secret")).toBe("dev.online.honeyschool.ru");
    for (const url of ["https://10.60.0.30/admin", "https://dev.online.honeyschool.ru.evil.test", "https://ops.honey.school:1234/", "http://online.honey.school/"]) expect(publicEndpoint(url)).toBeNull();
    observeConnection("api", "https://10.60.0.30/secret", true);
    expect(JSON.stringify([...connectionObservations()])).not.toContain("10.60");
  });
  it("keeps the API policy separate from observed media", () => {
    observeSessionPolicy("wss://dev.online.honeyschool.ru/livekit", "relay");
    expect(connectionObservations().get("policy")).toMatchObject({ policy: "relay" });
    expect(connectionObservations().get("policy")?.relayMatched).toBeUndefined();
    observeSessionPolicy("wss://dev.online.honeyschool.ru/livekit", "invalid");
    expect(connectionObservations().get("policy")?.state).toBe("unavailable");
  });
  it("invalidates a previous connected observation on disconnect", () => {
    observeConnection("publisher", "https://dev.online.honeyschool.ru", true, { transport: "turn-tls", relayMatched: true });
    observeConnection("publisher", "https://dev.online.honeyschool.ru", false);
    expect(connectionObservations().get("publisher")).toMatchObject({ state: "unavailable" });
    expect(connectionObservations().get("publisher")?.relayMatched).toBeUndefined();
  });
  it("uses the physical key with exact platform modifiers and ignores typing/repeats", () => {
    const options = { code: "KeyD", key: "В", ctrlKey: true, altKey: true, shiftKey: true };
    expect(diagnosticsShortcut(new KeyboardEvent("keydown", options), false)).toBe(true);
    expect(diagnosticsShortcut(new KeyboardEvent("keydown", { ...options, ctrlKey: false, metaKey: true }), true)).toBe(true);
    expect(diagnosticsShortcut(new KeyboardEvent("keydown", { ...options, repeat: true }), false)).toBe(false);
    expect(diagnosticsShortcut(new KeyboardEvent("keydown", { ...options, isComposing: true }), false)).toBe(false);
    expect(diagnosticsShortcut(new KeyboardEvent("keydown", options), true)).toBe(false);
    const input = document.createElement("input");
    input.addEventListener("keydown", (event) => expect(diagnosticsShortcut(event, false)).toBe(false));
    input.dispatchEvent(new KeyboardEvent("keydown", options));
  });
});

describe("generated and handwritten fetch observation", () => {
  it("preserves the exact native response and unread body while observing its public endpoint", async () => {
    const original = window.fetch;
    const response = new Response("private-body");
    Object.defineProperty(response, "url", { value: "https://dev.online.honeyschool.ru/api/users/me/profile?secret=private" });
    window.fetch = vi.fn().mockResolvedValue(response);
    const restore = installConnectionObservation();
    try {
      const result = await window.fetch("https://dev.online.honeyschool.ru/api/users/me/profile");
      expect(result).toBe(response);
      expect(result.bodyUsed).toBe(false);
      expect(connectionObservations().get("api")).toMatchObject({ endpoint: "dev.online.honeyschool.ru", state: "connected" });
      expect(JSON.stringify([...connectionObservations()])).not.toContain("private");
    } finally { restore(); window.fetch = original; }
  });
  it("preserves rejection identity and keeps telemetry failure separate from API connectivity", async () => {
    const original = window.fetch;
    const failure = new TypeError("network");
    window.fetch = vi.fn().mockRejectedValue(failure);
    const restore = installConnectionObservation();
    try {
      observeConnection("api", "https://dev.online.honeyschool.ru", true);
      await expect(window.fetch("https://dev.online.honeyschool.ru/api/diagnostics/regional-route")).rejects.toBe(failure);
      expect(connectionObservations().get("api")?.state).toBe("connected");
      await expect(window.fetch("https://dev.online.honeyschool.ru/api/users/me/profile")).rejects.toBe(failure);
      expect(connectionObservations().get("api")?.state).toBe("unavailable");
    } finally { restore(); window.fetch = original; }
  });
});
