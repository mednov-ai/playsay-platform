import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "../api/errors";
import { completeLogin, completedLoginReturnPath } from "./oidc";

vi.mock("../api/errors", () => ({ apiFetch: vi.fn(), apiErrorFromResponse: vi.fn() }));

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", { location: { origin: "https://dev.key.honey.school" }, sessionStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  vi.mocked(apiFetch).mockReset();
});
afterEach(() => vi.unstubAllGlobals());

it("restores the launch after code exchange and duplicate callback without exchanging twice", async () => {
  const path = "/?vocabularySessionId=11111111-1111-4111-a111-111111111111&returnTo=https%3A%2F%2Fdev.online.honey.school%2F";
  const config = { issuer: "https://issuer.invalid", clientId: "test-client", redirectPath: "/auth/callback" };
  window.sessionStorage.setItem("playsay.keyboard.auth.loginFlow", JSON.stringify({
    codeVerifier: "verifier", state: "callback-state", redirectUri: `${window.location.origin}/auth/callback`, returnPath: path,
  }));
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ access_token: "test-token", expires_in: 300 }), { status: 200 }));
  const callback = new URL(`${window.location.origin}/auth/callback?code=test-code&state=callback-state`);
  await completeLogin(callback, config);
  expect(window.sessionStorage.getItem("playsay.keyboard.auth.loginFlow")).toBeNull();
  expect(completedLoginReturnPath()).toBe(path);
  await completeLogin(callback, config);
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(completedLoginReturnPath()).toBe(path);
});
