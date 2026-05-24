import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, mapTokenResponse, type AuthConfig } from "./auth";

const config: AuthConfig = {
  issuer: "https://ops.play-and-say.ru:18443/keycloak/realms/playsay/",
  clientId: "playsay-web",
  redirectPath: "/auth/callback",
};

describe("auth helpers", () => {
  it("builds a PKCE authorization URL for the playsay web client", () => {
    const url = buildAuthorizeUrl({
      config,
      redirectUri: "https://online.play-and-say.ru/auth/callback",
      state: "state-1",
      codeChallenge: "challenge-1",
    });

    expect(url.toString()).toContain("/protocol/openid-connect/auth");
    expect(url.searchParams.get("client_id")).toBe("playsay-web");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://online.play-and-say.ru/auth/callback",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
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
});
