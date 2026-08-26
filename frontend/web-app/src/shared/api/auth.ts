import { normalizeLanguage, rememberPendingLoginLanguage } from "../i18n";
import { apiErrorFromResponse, apiFetch } from "./errors";
import { currentApiLanguage } from "./locale";

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
  silent?: boolean;
  returnPath?: string;
};

type CompletedLoginFlow = {
  clientId: string;
  code: string;
  redirectUri: string;
  state: string;
};

type ThemeMode = "system" | "light" | "dark";

export function defaultAuthIssuer(hostname = globalThis.location?.hostname ?? ""): string {
  if (
    hostname === "online.honey.school"
    || hostname === "key.honey.school"
    || hostname === "online.honeyschool.ru"
    || hostname === "key.honeyschool.ru"
  ) {
    return "https://ops.honey.school/keycloak/realms/playsay";
  }
  if (hostname === "dev.online.honey.school" || hostname === "dev.key.honey.school") {
    return "https://dev.ops.honey.school/keycloak/realms/playsay";
  }
  return "https://ops.play-and-say.ru:18443/keycloak/realms/playsay";
}

export const authConfig: AuthConfig = {
  issuer: import.meta.env.VITE_AUTH_ISSUER ?? defaultAuthIssuer(),
  clientId: import.meta.env.VITE_AUTH_CLIENT_ID ?? "playsay-web",
  redirectPath: import.meta.env.VITE_AUTH_REDIRECT_PATH ?? "/auth/callback",
};

const tokenStorageKey = "playsay.auth.tokens";
const flowStorageKey = "playsay.auth.loginFlow";
const completedFlowStorageKey = "playsay.auth.completedLoginFlow";
const completedLoginReturnPathStorageKey = "playsay.auth.completedLoginReturnPath";
const skipSilentLoginStorageKey = "playsay.auth.skipSilentLoginOnce";
const themeStorageKey = "playsay.theme";
const expirySkewMs = 30_000;
const loginCompletionRequests = new Map<string, Promise<TokenSet>>();

export class SilentLoginUnavailableError extends Error {
  constructor(message = "Silent login is unavailable.") {
    super(message);
    this.name = "SilentLoginUnavailableError";
  }
}

export function isSilentLoginUnavailable(error: unknown): error is SilentLoginUnavailableError {
  return error instanceof SilentLoginUnavailableError;
}

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
  window.sessionStorage.removeItem(completedFlowStorageKey);
  window.sessionStorage.removeItem(completedLoginReturnPathStorageKey);
}

export function storeTokens(tokens: TokenSet): void {
  window.sessionStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
}

export async function startLogin(config = authConfig): Promise<void> {
  const redirectUri = getRedirectUri(config);
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createCodeVerifier();
  const language = currentApiLanguage();
  const flow: LoginFlow = { codeVerifier, state, redirectUri };

  rememberPendingLoginLanguage(language);
  window.sessionStorage.setItem(flowStorageKey, JSON.stringify(flow));
  window.location.assign(
    buildAuthorizeUrl({
      config,
      redirectUri,
      state,
      codeChallenge,
      themeMode: readStoredThemeMode(),
      uiLocales: language,
    }).toString(),
  );
}

export async function startLessonAssertionLogin(
  assertion: string,
  returnPath: string,
  config = authConfig,
): Promise<void> {
  const redirectUri = getRedirectUri(config);
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createCodeVerifier();
  const language = currentApiLanguage();
  const flow: LoginFlow = { codeVerifier, state, redirectUri, returnPath: safeReturnPath(returnPath) };
  rememberPendingLoginLanguage(language);
  window.sessionStorage.setItem(flowStorageKey, JSON.stringify(flow));
  window.location.assign(buildAuthorizeUrl({
    config,
    redirectUri,
    state,
    codeChallenge,
    lessonAssertion: assertion,
    themeMode: readStoredThemeMode(),
    uiLocales: language,
  }).toString());
}

export async function startSilentLogin(config = authConfig, returnPath?: string): Promise<void> {
  const redirectUri = getRedirectUri(config);
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createCodeVerifier();
  const flow: LoginFlow = { codeVerifier, state, redirectUri, silent: true, returnPath: safeReturnPath(returnPath) };

  window.sessionStorage.setItem(flowStorageKey, JSON.stringify(flow));
  window.location.assign(
    buildAuthorizeUrl({
      config,
      redirectUri,
      state,
      codeChallenge,
      prompt: "none",
      themeMode: readStoredThemeMode(),
      uiLocales: currentApiLanguage(),
    }).toString(),
  );
}

export async function completeLogin(url: URL, config = authConfig): Promise<TokenSet> {
  const error = url.searchParams.get("error");
  if (error) {
    const state = url.searchParams.get("state");
    const flow = readLoginFlow();
    if (flow?.silent && state === flow.state && isKeycloakSilentLoginError(error)) {
      if (flow.returnPath) {
        window.sessionStorage.setItem(completedLoginReturnPathStorageKey, safeReturnPath(flow.returnPath));
      }
      window.sessionStorage.removeItem(flowStorageKey);
      throw new SilentLoginUnavailableError(url.searchParams.get("error_description") ?? error);
    }
    throw new Error(url.searchParams.get("error_description") ?? error);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    throw new Error("Auth callback state is invalid.");
  }

  if (isCompletedLoginFlow(readCompletedLoginFlow(), config, code, state)) {
    const existingTokens = readTokens();
    if (existingTokens) {
      return existingTokens;
    }
  }

  const completionKey = `${config.clientId}:${state}:${code}`;
  const inFlightCompletion = loginCompletionRequests.get(completionKey);
  if (inFlightCompletion) {
    return inFlightCompletion;
  }

  const completion = exchangeLoginCode(config, code, state);
  loginCompletionRequests.set(completionKey, completion);

  try {
    return await completion;
  } finally {
    loginCompletionRequests.delete(completionKey);
  }
}

export function consumeCompletedLoginReturnPath(): string | null {
  const value = window.sessionStorage.getItem(completedLoginReturnPathStorageKey);
  window.sessionStorage.removeItem(completedLoginReturnPathStorageKey);
  return value ? safeReturnPath(value) : null;
}
export function skipSilentLoginOnce(): void {
  window.sessionStorage.setItem(skipSilentLoginStorageKey, "true");
}

export function consumeSkipSilentLogin(): boolean {
  const value = window.sessionStorage.getItem(skipSilentLoginStorageKey);
  window.sessionStorage.removeItem(skipSilentLoginStorageKey);
  return value === "true";
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

  const response = await apiFetch(`${trimTrailingSlash(config.issuer)}/protocol/openid-connect/token`, {
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
  storeTokens(refreshed);
  return refreshed.accessToken;
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
  prompt?: "none";
  themeMode?: string;
  uiLocales?: string;
  lessonAssertion?: string;
}): URL {
  const url = new URL(`${trimTrailingSlash(input.config.issuer)}/protocol/openid-connect/auth`);
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.prompt) {
    url.searchParams.set("prompt", input.prompt);
  }
  if (input.lessonAssertion) {
    url.searchParams.set("lesson_assertion", input.lessonAssertion);
  }
  if (input.uiLocales) {
    url.searchParams.set("ui_locales", normalizeLanguage(input.uiLocales));
  }
  if (isThemeMode(input.themeMode)) {
    url.searchParams.set("playsay_theme", input.themeMode);
  }
  return url;
}

function readStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const value = window.localStorage?.getItem(themeStorageKey);
  return isThemeMode(value) ? value : "system";
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function isKeycloakSilentLoginError(error: string): boolean {
  return error === "login_required" || error === "interaction_required";
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

async function exchangeLoginCode(config: AuthConfig, code: string, state: string): Promise<TokenSet> {
  const flow = readLoginFlow();
  if (!flow || state !== flow.state) {
    throw new Error("Auth callback state is invalid.");
  }

  const response = await apiFetch(`${trimTrailingSlash(config.issuer)}/protocol/openid-connect/token`, {
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
  if (flow.returnPath) {
    window.sessionStorage.setItem(completedLoginReturnPathStorageKey, safeReturnPath(flow.returnPath));
  }
  window.sessionStorage.removeItem(flowStorageKey);
  storeTokens(tokens);
  writeCompletedLoginFlow({
    clientId: config.clientId,
    code,
    redirectUri: flow.redirectUri,
    state,
  });
  return tokens;
}

function readCompletedLoginFlow(): CompletedLoginFlow | null {
  const value = window.sessionStorage.getItem(completedFlowStorageKey);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as CompletedLoginFlow;
  } catch {
    window.sessionStorage.removeItem(completedFlowStorageKey);
    return null;
  }
}

function writeCompletedLoginFlow(flow: CompletedLoginFlow): void {
  window.sessionStorage.setItem(completedFlowStorageKey, JSON.stringify(flow));
}

function isCompletedLoginFlow(
  flow: CompletedLoginFlow | null,
  config: AuthConfig,
  code: string,
  state: string,
): boolean {
  return Boolean(
    flow &&
    flow.clientId === config.clientId &&
    flow.code === code &&
    flow.redirectUri === getRedirectUri(config) &&
    flow.state === state
  );
}

async function parseTokenResponse(response: Response): Promise<TokenSet> {
  if (!response.ok) {
    throw await apiErrorFromResponse(response, `Token request failed with HTTP ${response.status}.`);
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

function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}
