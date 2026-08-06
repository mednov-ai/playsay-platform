import { describe, expect, it } from "vitest";
import {
  isTrustedPlaySayOrigin,
  parsePageCommand,
  sessionsToReplace,
} from "./protocol";

describe("extension protocol", () => {
  it("accepts current HoneySchool and local Honey School origins only", () => {
    expect(isTrustedPlaySayOrigin("https://dev.online.honey.school")).toBe(true);
    expect(isTrustedPlaySayOrigin("https://online.honey.school")).toBe(true);
    expect(isTrustedPlaySayOrigin("https://online.honeyschool.ru")).toBe(true);
    expect(isTrustedPlaySayOrigin("http://localhost:5173")).toBe(true);
    expect(isTrustedPlaySayOrigin("http://127.0.0.1:4173")).toBe(true);
    expect(isTrustedPlaySayOrigin("https://online.play-and-say.ru")).toBe(false);
    expect(isTrustedPlaySayOrigin("https://play-and-say.ru")).toBe(false);
    expect(isTrustedPlaySayOrigin("https://evil.example")).toBe(false);
    expect(isTrustedPlaySayOrigin("https://online.honey.school.evil.example")).toBe(false);
    expect(isTrustedPlaySayOrigin("https://dev-online.honey.school")).toBe(false);
    expect(isTrustedPlaySayOrigin("http://online.honey.school")).toBe(false);
  });

  it("requires a versioned command with matching session and nonce", () => {
    expect(parsePageCommand({ version: 1, type: "PREPARE", sessionId: "s-1", nonce: "n-1", url: "https://wordwall.net/resource/1" })).toEqual({
      version: 1,
      type: "PREPARE",
      sessionId: "s-1",
      nonce: "n-1",
      url: "https://wordwall.net/resource/1",
    });
    expect(parsePageCommand({ version: 2, type: "PREPARE" })).toBeNull();
    expect(parsePageCommand({ version: 1, type: "PREPARE", sessionId: "", nonce: "n", url: "javascript:alert(1)" })).toBeNull();
  });

  it("accepts additive normalized pointer coordinates", () => {
    expect(parsePageCommand({
      version: 1,
      type: "INPUT",
      sessionId: "s-1",
      nonce: "n-1",
      input: {
        type: "pointer",
        action: "down",
        x: 640,
        y: 360,
        normalizedX: 0.5,
        normalizedY: 0.5,
      },
    })).toMatchObject({
      type: "INPUT",
      input: { normalizedX: 0.5, normalizedY: 0.5 },
    });
  });

  it("rejects invalid normalized coordinates and unsupported input", () => {
    expect(parsePageCommand({
      version: 1,
      type: "INPUT",
      sessionId: "s-1",
      nonce: "n-1",
      input: { type: "pointer", action: "move", x: 10, y: 20, normalizedX: 1.1, normalizedY: 0.5 },
    })).toBeNull();
    expect(parsePageCommand({
      version: 1,
      type: "INPUT",
      sessionId: "s-1",
      nonce: "n-1",
      input: { type: "clipboard", value: "secret" },
    })).toBeNull();
  });

  it("replaces the previous tab whenever the same classroom launches a new capture session", () => {
    const sessions = [
      { consumerTabId: 10, sessionId: "old-session" },
      { consumerTabId: 11, sessionId: "other-classroom" },
      { consumerTabId: 12, sessionId: "new-session" },
    ];

    expect(sessionsToReplace(sessions, 10, "new-session")).toEqual([
      sessions[0],
      sessions[2],
    ]);
  });
});
