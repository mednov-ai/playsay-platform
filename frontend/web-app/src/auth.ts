import {
  deleteMyUserProfile,
  getMe,
  getMyUserProfile,
  updateMyUserProfile,
  type MeResponse,
  type UpdateUserProfileRequest,
  type UserProfileResponse,
} from "./generated/playsay-api";

export type AuthConfig = {
  issuer: string;
  clientId: string;
  redirectPath: string;
};

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
};

export type MeProfile = MeResponse;
export type AppUserProfile = UserProfileResponse;
export type UpdateUserProfileInput = UpdateUserProfileRequest;

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
};

type LoginFlow = {
  codeVerifier: string;
  state: string;
  redirectUri: string;
};

export const authConfig: AuthConfig = {
  issuer:
    import.meta.env.VITE_AUTH_ISSUER ??
    "https://ops.play-and-say.ru:18443/keycloak/realms/playsay",
  clientId: import.meta.env.VITE_AUTH_CLIENT_ID ?? "playsay-web",
  redirectPath: import.meta.env.VITE_AUTH_REDIRECT_PATH ?? "/auth/callback",
};

const tokenStorageKey = "playsay.auth.tokens";
const flowStorageKey = "playsay.auth.loginFlow";
const expirySkewMs = 30_000;

export function isAuthCallback(url: URL): boolean {
  return url.pathname === authConfig.redirectPath && (url.searchParams.has("code") || url.searchParams.has("error"));
}

export function readTokens(): TokenSet | null {
  const value = window.sessionStorage.getItem(tokenStorageKey);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as TokenSet;
  } catch {
    clearTokens();
    return null;
  }
}

export function clearTokens(): void {
  window.sessionStorage.removeItem(tokenStorageKey);
  window.sessionStorage.removeItem(flowStorageKey);
}

export async function startLogin(config = authConfig): Promise<void> {
  const redirectUri = getRedirectUri(config);
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createCodeVerifier();
  const flow: LoginFlow = { codeVerifier, state, redirectUri };

  window.sessionStorage.setItem(flowStorageKey, JSON.stringify(flow));
  window.location.assign(
    buildAuthorizeUrl({
      config,
      redirectUri,
      state,
      codeChallenge,
    }).toString(),
  );
}

export async function completeLogin(url: URL, config = authConfig): Promise<TokenSet> {
  const error = url.searchParams.get("error");
  if (error) {
    throw new Error(url.searchParams.get("error_description") ?? error);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const flow = readLoginFlow();
  if (!code || !state || !flow || state !== flow.state) {
    throw new Error("Auth callback state is invalid.");
  }

  const response = await fetch(`${trimTrailingSlash(config.issuer)}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      redirect_uri: flow.redirectUri,
      code,
      code_verifier: flow.codeVerifier,
    }),
  });

  const tokens = await parseTokenResponse(response);
  window.sessionStorage.removeItem(flowStorageKey);
  writeTokens(tokens);
  return tokens;
}

export async function getValidAccessToken(config = authConfig): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) {
    return null;
  }

  if (tokens.expiresAt > Date.now() + expirySkewMs) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    clearTokens();
    return null;
  }

  const response = await fetch(`${trimTrailingSlash(config.issuer)}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!response.ok) {
    clearTokens();
    return null;
  }

  const refreshed = await parseTokenResponse(response);
  writeTokens(refreshed);
  return refreshed.accessToken;
}

export async function fetchMe(config = authConfig): Promise<MeProfile> {
  const response = await getMe(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw new Error(`Profile request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchUserProfile(config = authConfig): Promise<AppUserProfile> {
  const response = await getMyUserProfile(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw new Error(`User profile request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function saveUserProfile(
  input: UpdateUserProfileInput,
  config = authConfig,
): Promise<AppUserProfile> {
  const response = await updateMyUserProfile(input, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw new Error(`User profile update failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function resetUserProfile(config = authConfig): Promise<void> {
  const response = await deleteMyUserProfile(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 204) {
    throw new Error(`User profile reset failed with HTTP ${response.status}.`);
  }
}

async function authorizedOptions(config: AuthConfig): Promise<RequestInit> {
  const accessToken = await getValidAccessToken(config);
  if (!accessToken) {
    throw new Error("Not authenticated.");
  }

  return {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

export function buildLogoutUrl(config = authConfig): string {
  const tokens = readTokens();
  const url = new URL(`${trimTrailingSlash(config.issuer)}/protocol/openid-connect/logout`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("post_logout_redirect_uri", window.location.origin);
  if (tokens?.idToken) {
    url.searchParams.set("id_token_hint", tokens.idToken);
  }
  return url.toString();
}

export function buildAuthorizeUrl(input: {
  config: AuthConfig;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): URL {
  const url = new URL(`${trimTrailingSlash(input.config.issuer)}/protocol/openid-connect/auth`);
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export function mapTokenResponse(response: TokenResponse, now = Date.now()): TokenSet {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    idToken: response.id_token,
    expiresAt: now + response.expires_in * 1000,
  };
}

function getRedirectUri(config: AuthConfig): string {
  return `${window.location.origin}${config.redirectPath}`;
}

function readLoginFlow(): LoginFlow | null {
  const value = window.sessionStorage.getItem(flowStorageKey);
  if (!value) {
    return null;
  }
  return JSON.parse(value) as LoginFlow;
}

function writeTokens(tokens: TokenSet): void {
  window.sessionStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
}

async function parseTokenResponse(response: Response): Promise<TokenSet> {
  if (!response.ok) {
    throw new Error(`Token request failed with HTTP ${response.status}.`);
  }

  return mapTokenResponse((await response.json()) as TokenResponse);
}

function createCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
