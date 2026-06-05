import { afterEach, describe, expect, it, vi } from "vitest";
import { keyboardApiPath, resolveAnonymousProfile } from "./keyboardApi";

afterEach(() => {
  vi.restoreAllMocks();
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
});
