import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  defaultAuthIssuer,
  mapTokenResponse,
  type AuthConfig,
} from "./oidc";

const config: AuthConfig = {
  issuer: "https://ops.play-and-say.ru:18443/keycloak/realms/playsay/",
  clientId: "playsay-web",
  redirectPath: "/auth/callback",
};

describe("keyboard auth helpers", () => {
  it("selects the canonical honey issuer for production, development, and legacy rollback hosts", () => {
    expect(defaultAuthIssuer("key.honey.school")).toBe(
      "https://ops.honey.school/keycloak/realms/playsay",
    );
    expect(defaultAuthIssuer("dev.key.honey.school")).toBe(
      "https://dev.ops.honey.school/keycloak/realms/playsay",
    );
    expect(defaultAuthIssuer("key.play-and-say.ru")).toBe(
      "https://dev.ops.honey.school/keycloak/realms/playsay",
    );
  });

  it("builds a PKCE authorization URL for key.play-and-say.ru", () => {
    const url = buildAuthorizeUrl({
      config,
      redirectUri: "https://key.play-and-say.ru/auth/callback",
      state: "state-1",
      codeChallenge: "challenge-1",
      themeMode: "dark",
      uiLocales: "ru",
    });

    expect(url.pathname).toContain("/protocol/openid-connect/auth");
    expect(url.searchParams.get("client_id")).toBe("playsay-web");
    expect(url.searchParams.get("redirect_uri")).toBe("https://key.play-and-say.ru/auth/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("playsay_theme")).toBe("dark");
    expect(url.searchParams.get("ui_locales")).toBe("ru");
  });

  it("does not leak invalid theme values to Keycloak", () => {
    const url = buildAuthorizeUrl({
      config,
      redirectUri: "https://key.play-and-say.ru/auth/callback",
      state: "state-1",
      codeChallenge: "challenge-1",
      themeMode: "sepia",
      uiLocales: "de-DE",
    });

    expect(url.searchParams.has("playsay_theme")).toBe(false);
    expect(url.searchParams.get("ui_locales")).toBe("de");
  });

  it("maps token expiry to an absolute timestamp", () => {
    expect(
      mapTokenResponse(
        {
          access_token: "access-token",
          refresh_token: "refresh-token",
          id_token: "id-token",
          expires_in: 90,
        },
        1_000,
      ),
    ).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      idToken: "id-token",
      expiresAt: 91_000,
    });
  });
});
