import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  clearTokens,
  completeLogin,
  defaultAuthIssuer,
  isSilentLoginUnavailable,
  mapTokenResponse,
  readTokens,
  storeTokens,
  type AuthConfig,
} from "./shared/auth/oidc";

const config: AuthConfig = {
  issuer: "https://ops.play-and-say.ru:18443/keycloak/realms/playsay/",
  clientId: "playsay-web",
  redirectPath: "/auth/callback",
};

describe("auth helpers", () => {
  afterEach(() => {
    if (typeof window !== "undefined") {
      clearTokens();
    }
    vi.unstubAllGlobals();
  });

  it("selects the canonical honey issuer for production and development hosts", () => {
    expect(defaultAuthIssuer("online.honey.school")).toBe(
      "https://ops.honey.school/keycloak/realms/playsay",
    );
    expect(defaultAuthIssuer("online.honeyschool.ru")).toBe(
      "https://ops.honey.school/keycloak/realms/playsay",
    );
    expect(defaultAuthIssuer("dev.online.honey.school")).toBe(
      "https://dev.ops.honey.school/keycloak/realms/playsay",
    );
  });

  it("builds a PKCE authorization URL for the playsay web client", () => {
    const url = buildAuthorizeUrl({
      config,
      redirectUri: "https://online.play-and-say.ru/auth/callback",
      state: "state-1",
      codeChallenge: "challenge-1",
      uiLocales: "en",
    });

    expect(url.toString()).toContain("/protocol/openid-connect/auth");
    expect(url.searchParams.get("client_id")).toBe("playsay-web");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://online.play-and-say.ru/auth/callback",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("ui_locales")).toBe("en");
  });

  it("can request a silent SSO check without showing the Keycloak login form", () => {
    const url = buildAuthorizeUrl({
      config,
      redirectUri: "https://online.play-and-say.ru/auth/callback",
      state: "state-1",
      codeChallenge: "challenge-1",
      prompt: "none",
    });

    expect(url.searchParams.get("prompt")).toBe("none");
  });

  it("passes the selected app theme to Keycloak authorization", () => {
    const url = buildAuthorizeUrl({
      config,
      redirectUri: "https://online.play-and-say.ru/auth/callback",
      state: "state-1",
      codeChallenge: "challenge-1",
      themeMode: "dark",
      uiLocales: "en",
    });

    expect(url.searchParams.get("playsay_theme")).toBe("dark");
    expect(url.searchParams.get("ui_locales")).toBe("en");
  });

  it("does not pass invalid theme values to Keycloak authorization", () => {
    const url = buildAuthorizeUrl({
      config,
      redirectUri: "https://online.play-and-say.ru/auth/callback",
      state: "state-1",
      codeChallenge: "challenge-1",
      themeMode: "sepia",
    });

    expect(url.searchParams.has("playsay_theme")).toBe(false);
  });

  it("maps token expiration to an absolute timestamp", () => {
    expect(
      mapTokenResponse(
        {
          access_token: "access",
          refresh_token: "refresh",
          id_token: "id",
          expires_in: 60,
        },
        1_000,
      ),
    ).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      idToken: "id",
      expiresAt: 61_000,
    });
  });

  it("stores token sets issued by the managed student invite exchange", () => {
    const storage = new MemoryStorage();
    vi.stubGlobal("window", { sessionStorage: storage });

    storeTokens({
      accessToken: "invite-access",
      refreshToken: "invite-refresh",
      idToken: "invite-id",
      expiresAt: 61_000,
    });

    expect(readTokens()).toEqual({
      accessToken: "invite-access",
      refreshToken: "invite-refresh",
      idToken: "invite-id",
      expiresAt: 61_000,
    });
  });

  it("deduplicates concurrent authorization-code exchange for the same callback", async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "playsay.auth.loginFlow",
      JSON.stringify({
        codeVerifier: "verifier-1",
        redirectUri: "https://online.play-and-say.ru/auth/callback",
        state: "state-1",
      }),
    );
    vi.stubGlobal("window", { sessionStorage: storage });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access",
        refresh_token: "refresh",
        id_token: "id",
        expires_in: 60,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "invalid_grant",
        error_description: "Code not valid",
      }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const callbackUrl = new URL("https://online.play-and-say.ru/auth/callback?code=code-1&state=state-1");
    const [first, second] = await Promise.all([
      completeLogin(callbackUrl, config),
      completeLogin(callbackUrl, config),
    ]);

    expect(first.accessToken).toBe("access");
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats Keycloak login_required callback as anonymous after a silent SSO check", async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "playsay.auth.loginFlow",
      JSON.stringify({
        codeVerifier: "verifier-1",
        redirectUri: "https://online.play-and-say.ru/auth/callback",
        silent: true,
        state: "state-1",
      }),
    );
    vi.stubGlobal("window", { sessionStorage: storage });

    await expect(
      completeLogin(new URL("https://online.play-and-say.ru/auth/callback?error=login_required&state=state-1"), config),
    ).rejects.toSatisfy(isSilentLoginUnavailable);

    expect(storage.getItem("playsay.auth.loginFlow")).toBeNull();
  });
});

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
