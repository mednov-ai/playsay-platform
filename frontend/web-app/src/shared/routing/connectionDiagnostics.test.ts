// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { diagnosticsShortcut, observeConnection, connectionObservations, publicEndpoint } from "./connectionDiagnostics";

describe("connection diagnostic boundary", () => {
  it("keeps only declared public hosts, discarding credentials and paths", () => {
    expect(publicEndpoint("wss://dev.online.honeyschool.ru/collab/ws?token=secret")).toBe("dev.online.honeyschool.ru");
    for (const url of ["https://10.60.0.30/admin", "https://dev.online.honeyschool.ru.evil.test", "https://ops.honey.school:1234/", "http://online.honey.school/"]) expect(publicEndpoint(url)).toBeNull();
    observeConnection("api", "https://10.60.0.30/secret", true);
    expect(JSON.stringify([...connectionObservations()])).not.toContain("10.60");
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
