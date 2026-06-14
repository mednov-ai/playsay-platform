import { afterEach, describe, expect, it, vi } from "vitest";
import { claimAnonymousProgress, keyboardApiPath, resolveAnonymousProfile, submitAnonymousResult } from "./keyboardApi";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("keyboard API paths", () => {
  it("keeps trainer calls under the authenticated /api namespace", () => {
    expect(keyboardApiPath("/chord-sets", new URLSearchParams({ layout: "EN" }))).toBe("/api/chord-sets?layout=EN");
    expect(keyboardApiPath("/training/progress")).toBe("/api/training/progress");
  });

  it("can resolve anonymous profiles without an auth token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 17,
          deviceId: "device-1",
          displayName: "Masha",
          sessions: 2,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(resolveAnonymousProfile({ deviceId: "device-1" })).resolves.toMatchObject({
      displayName: "Masha",
      sessions: 2,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/anonymous/profile/resolve",
      expect.objectContaining({
        method: "POST",
        headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
      }),
    );
  });

  it("claims anonymous progress with an authenticated request", async () => {
    const sessionStorage = memoryStorage();
    vi.stubGlobal("window", { sessionStorage });
    sessionStorage.setItem("playsay.keyboard.auth.tokens", JSON.stringify({
      accessToken: "token-1",
      expiresAt: Date.now() + 60_000,
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          claimedResults: 2,
          progress: {
            sessions: 2,
            bestSpeedCpm: 190,
            avgSpeedCpm: 180,
            avgAccuracy: 0.93,
            weakFingers: [],
            recent: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(claimAnonymousProgress({ deviceId: "device-1" })).resolves.toMatchObject({
      claimedResults: 2,
      progress: { sessions: 2 },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/training/claim-anonymous",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token-1" }),
      }),
    );
  });

  it("accepts created anonymous training results and keeps the response layout", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          trainingResult: {
            id: 21,
            clientResultId: "client-1",
            chordSetId: 1,
            layout: "EN",
            lessonKind: "STANDARD",
            speedCpm: 180,
            averageCpm: 180,
            cadence: 0.8,
            masteryCpm: 172,
            masteryDelta: 0,
            accuracy: 1,
            errors: 0,
            characterCount: 180,
            correctCount: 180,
            durationMs: 60_000,
            perChar: {},
            perChord: {},
            focusProblemKeys: [],
            clientTimezone: "UTC",
            localTrainingDate: "2026-06-14",
            createdAt: "2026-06-14T12:00:00Z",
          },
          progress: {
            sessions: 1,
            bestSpeedCpm: 180,
            avgSpeedCpm: 180,
            avgAccuracy: 1,
            weakFingers: [],
            recent: [],
          },
          gamification: {
            calibrated: false,
            calibrationSessions: 1,
            calibrationTarget: 3,
            masteryCpm: 172,
            leagueLevel: 1,
            leagueProgress: 72,
            currentStreak: 1,
            bestStreak: 1,
            streakFreezes: 0,
            trend: [172],
            achievements: [],
          },
          events: [],
          techniqueAdvice: {
            primaryAdvice: "Keep going.",
            drillSuggestion: "Repeat.",
            tone: "STEADY",
            source: "RULES",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      submitAnonymousResult({
        deviceId: "device-1",
        clientResultId: "client-1",
        chordSetId: 1,
        lessonKind: "STANDARD",
        speedCpm: 180,
        averageCpm: 180,
        cadence: 0.8,
        accuracy: 1,
        errors: 0,
        characterCount: 180,
        correctCount: 180,
        durationMs: 60_000,
        perFinger: {},
      }),
    ).resolves.toMatchObject({
      trainingResult: {
        layout: "EN",
      },
    });
  });
});

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
