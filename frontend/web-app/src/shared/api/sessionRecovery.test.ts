// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { apiJson, authorizedRequest } from "./http";
import { getSessionRecoveryDiagnostics, reportSessionRecovery } from "./sessionRecovery";
import { clearTokens, getValidAccessToken, readTokens, storeTokens, authConfig, recoverSession, markSessionVerified, skipSilentLoginOnce, safeReturnPath, completeLogin } from "./auth";

describe("session recovery regressions", () => {
  beforeEach(() => { sessionStorage.clear(); clearTokens(); });
  afterEach(() => { clearTokens(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("coordinates parallel callers instead of refreshing twice", async () => {
    storeTokens({ accessToken: "old", refreshToken: "refresh", expiresAt: 0 });
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ access_token: "new", refresh_token: "next", expires_in: 300 })));
    vi.stubGlobal("fetch", fetch);
    expect(await Promise.all([getValidAccessToken(), getValidAccessToken()])).toEqual(["new", "new"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retains credentials when the provider is unavailable", async () => {
    vi.useFakeTimers();
    storeTokens({ accessToken: "old", refreshToken: "refresh", expiresAt: 0 });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("", { status: 503 })));
    const result = expect(getValidAccessToken(authConfig)).rejects.toMatchObject({ errorCode: "SESSION_UNAVAILABLE" });
    await vi.runAllTimersAsync(); await result;
    expect(readTokens()?.refreshToken).toBe("refresh");
  });
  it("reports definitive rejection distinctly", async () => {
    storeTokens({ accessToken: "old", refreshToken: "refresh", expiresAt: 0 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant", error_description: "private provider content" }), { status: 400 })));
    await expect(getValidAccessToken()).rejects.toMatchObject({ errorCode: "SESSION_REJECTED" });
    expect(readTokens()).toBeNull();
  });
  it("does not restore tokens after logout while refresh is pending", async () => {
    storeTokens({ accessToken: "old", refreshToken: "refresh", expiresAt: 0 });
    const pending = deferred<Response>(); vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const task = getValidAccessToken().catch((error: unknown) => error);
    clearTokens();
    pending.resolve(tokenResponse("late"));
    expect(await task).toMatchObject({ errorCode: "SESSION_CHANGED" });
    expect(readTokens()).toBeNull();
  });
  it("does not overwrite a newer login with an old renewal", async () => {
    storeTokens({ accessToken: "old", refreshToken: "refresh", expiresAt: 0 });
    const pending = deferred<Response>(); vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const task = getValidAccessToken().catch((error: unknown) => error);
    storeTokens({ accessToken: "new-login", expiresAt: Date.now() + 300_000 });
    pending.resolve(tokenResponse("late"));
    expect(await task).toMatchObject({ errorCode: "SESSION_CHANGED" });
    expect(readTokens()?.accessToken).toBe("new-login");
  });
  it.each([401, 200])("fences stale API responses with HTTP %s", async (status) => {
    storeTokens({ accessToken: "old", expiresAt: Date.now() + 300_000 });
    const pending = deferred<Response>(); const fetch = vi.fn(() => pending.promise); vi.stubGlobal("fetch", fetch);
    const task = apiJson("/api/me", { method: "GET" }, authConfig).catch((error: unknown) => error);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    storeTokens({ accessToken: "new-login", expiresAt: Date.now() + 300_000 });
    pending.resolve(new Response("{}", { status }));
    expect(await task).toMatchObject({ errorCode: "SESSION_CHANGED" });
    expect(readTokens()?.accessToken).toBe("new-login");
  });
  it("fences generated client responses too", async () => {
    storeTokens({ accessToken: "old", expiresAt: Date.now() + 300_000 });
    const pending = deferred<{ status: number; data: object }>();
    const request = vi.fn(() => pending.promise);
    const task = authorizedRequest(authConfig, request).catch((error: unknown) => error);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    storeTokens({ accessToken: "new-login", expiresAt: Date.now() + 300_000 });
    pending.resolve({ status: 401, data: {} });
    expect(await task).toMatchObject({ errorCode: "SESSION_CHANGED" });
    expect(readTokens()?.accessToken).toBe("new-login");
  });
  it("retains a nonrotating refresh token", async () => {
    storeTokens({ accessToken: "old", refreshToken: "refresh", expiresAt: 0 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tokenResponse("new")));
    expect(await getValidAccessToken()).toBe("new");
    expect(readTokens()?.refreshToken).toBe("refresh");
  });
  it("bounds stalled renewal even if the transport ignores abort", async () => {
    vi.useFakeTimers(); storeTokens({ accessToken: "old", refreshToken: "refresh", expiresAt: 0 });
    const fetch = vi.fn(() => new Promise<Response>(() => undefined)); vi.stubGlobal("fetch", fetch);
    const task = getValidAccessToken().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await task).toMatchObject({ errorCode: "SESSION_UNAVAILABLE" });
    expect(fetch).toHaveBeenCalledTimes(2); expect(readTokens()?.refreshToken).toBe("refresh");
  });
  it("does not restart exhausted renewal from background callers before Retry", async () => {
    storeTokens({ accessToken: "old", refreshToken: "refresh", expiresAt: 0 });
    const fetch = vi.fn().mockImplementation(async () => new Response("", { status: 429, headers: { "Retry-After": "60" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(getValidAccessToken()).rejects.toMatchObject({ errorCode: "SESSION_UNAVAILABLE" });
    await expect(getValidAccessToken()).rejects.toMatchObject({ errorCode: "SESSION_UNAVAILABLE" });
    expect(fetch).toHaveBeenCalledOnce();
    reportSessionRecovery("recovering");
    fetch.mockResolvedValueOnce(tokenResponse("new"));
    expect(await getValidAccessToken()).toBe("new"); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("respects Retry-After that exceeds the local budget", async () => {
    storeTokens({ accessToken: "old", refreshToken: "refresh", expiresAt: 0 });
    const fetch = vi.fn().mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "60" } })); vi.stubGlobal("fetch", fetch);
    await expect(getValidAccessToken()).rejects.toMatchObject({ errorCode: "SESSION_UNAVAILABLE" });
    expect(fetch).toHaveBeenCalledOnce(); expect(readTokens()?.refreshToken).toBe("refresh");
  });
  it("sanitizes configuration errors and preserves credentials", async () => {
    storeTokens({ accessToken: "old", refreshToken: "refresh", expiresAt: 0 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_client", error_description: "private" }), { status: 400 })));
    const result = await getValidAccessToken().catch((error: unknown) => error);
    expect(result).toMatchObject({ errorCode: "AUTH_PROTOCOL_ERROR" });
    expect(String(result)).not.toContain("private"); expect(readTokens()?.refreshToken).toBe("refresh");
  });
  it("fences a callback exchange that completes after logout", async () => {
    stubNavigation();
    sessionStorage.setItem("playsay.auth.loginFlow", JSON.stringify({ state: "fixture-state", codeVerifier: "fixture-verifier", redirectUri: window.location.origin + "/auth/callback" }));
    const pending = deferred<Response>(); vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const task = completeLogin(new URL(window.location.origin + "/auth/callback?code=fixture-code&state=fixture-state")).catch((error: unknown) => error);
    clearTokens(); pending.resolve(tokenResponse("late"));
    expect(await task).toMatchObject({ errorCode: "SESSION_CHANGED" }); expect(readTokens()).toBeNull();
  });
  it("allows only one silent recovery until identity is verified", async () => {
    const assign = stubNavigation();
    await recoverSession();
    await expect(recoverSession()).rejects.toMatchObject({ errorCode: "SESSION_REJECTED" });
    expect(assign).toHaveBeenCalledOnce();
    markSessionVerified(); await recoverSession(); expect(assign).toHaveBeenCalledTimes(2);
  });
  it("does not silently recover explicit logout", async () => {
    const assign = stubNavigation(); skipSilentLoginOnce();
    await expect(recoverSession()).rejects.toMatchObject({ errorCode: "SESSION_REJECTED" });
    expect(assign).not.toHaveBeenCalled();
  });
  it("rejects stale recovery callbacks without exchanging a code", async () => {
    stubNavigation();
    sessionStorage.setItem("playsay.auth.recovery", JSON.stringify({ origin: window.location.origin, startedAt: Date.now() - 61_000 }));
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(completeLogin(new URL("https://online.honeyschool.ru/auth/callback?code=fixture&state=fixture"))).rejects.toMatchObject({ errorCode: "SESSION_REJECTED" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["//evil.example", "/\\evil.example", "/auth/callback?code=secret&state=secret", "/?access_token=secret"])("excludes unsafe return target %s", (target) => {
    expect(safeReturnPath(target)).toBe("/");
  });
  it("preserves internal navigation but strips lesson link capabilities", () => {
    expect(safeReturnPath("/lessons/fixture/classroom?tab=lesson#section")).toBe("/lessons/fixture/classroom?tab=lesson#section");
    expect(safeReturnPath("/l#secret-capability")).toBe("/l");
    expect(safeReturnPath("/lesson-access/fixture#token=secret")).toBe("/lesson-access/fixture");
  });
  it("does not replay a business mutation", async () => {
    storeTokens({ accessToken: "token", expiresAt: Date.now() + 300_000 });
    const fetch = vi.fn().mockRejectedValue(new TypeError("lost response")); vi.stubGlobal("fetch", fetch);
    await expect(apiJson("/api/schedule/lessons", { method: "POST", body: "{}" }, authConfig)).rejects.toMatchObject({ errorCode: "NETWORK_ERROR" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("retains only bounded allowlisted diagnostics", () => {
    for (let i = 0; i < 40; i++) reportSessionRecovery("recovering", 1, i);
    const entries = getSessionRecoveryDiagnostics(); expect(entries).toHaveLength(20);
    expect(Object.keys(entries[0]).sort()).toEqual(["attempts", "elapsedMs", "outcome"]);
    clearTokens(); expect(getSessionRecoveryDiagnostics()).toEqual([]);
  });

});

function tokenResponse(accessToken: string): Response {
  return new Response(JSON.stringify({ access_token: accessToken, expires_in: 300 }));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function stubNavigation() {
  const assign = vi.fn();
  vi.stubGlobal("window", { sessionStorage, localStorage, crypto: webcrypto, btoa,
    location: { origin: "https://online.honeyschool.ru", pathname: "/lessons/fixture/classroom", search: "?tab=lesson", hash: "#section", assign } });
  return assign;
}
