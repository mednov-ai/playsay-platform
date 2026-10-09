import { normalizeLanguage, rememberPendingLoginLanguage } from "../i18n";
import { ApiError } from "./errors";
import { authProtocolError, getSessionRecoveryPhase, reportSessionRecovery, resetSessionRecoveryDiagnostics, sessionChangedError, sessionRejectedError, sessionUnavailableError } from "./sessionRecovery";
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
  if (
    hostname === "dev.online.honey.school"
    || hostname === "dev.key.honey.school"
    || hostname === "dev.online.honeyschool.ru"
    || hostname === "dev.key.honeyschool.ru"
  ) {
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
const authControllers = new Set<AbortController>();
const recoveryStorageKey = "playsay.auth.recovery";
let credentialGeneration = 0;
let renewal: { key: string; promise: Promise<string | null>; controller: AbortController } | null = null;
const authRequestDeadlineMs = 10_000;
const renewalBudgetMs = 25_000;

export function getCredentialGeneration(): number { return credentialGeneration; }
export function markSessionVerified(): void {
  window.sessionStorage.removeItem(recoveryStorageKey);
  reportSessionRecovery("ready");
}
export function resetSilentRecovery(): void { window.sessionStorage.removeItem(recoveryStorageKey); }
export function canStartSilentRecovery(): boolean {
  return !window.sessionStorage.getItem(recoveryStorageKey)
    && window.sessionStorage.getItem(skipSilentLoginStorageKey) !== "true";
}
export async function recoverSession(config = authConfig): Promise<void> {
  if (!canStartSilentRecovery()) {
    reportSessionRecovery("signInRequired");
    throw sessionRejectedError();
  }
  window.sessionStorage.setItem(recoveryStorageKey, JSON.stringify({ startedAt: Date.now(), origin: window.location.origin }));
  reportSessionRecovery("recovering");
  try { await startSilentLogin(config); }
  catch (error) { reportSessionRecovery("signInRequired"); throw error; }
}

function invalidateCredentials(): void {
  credentialGeneration += 1;
  authControllers.forEach((controller) => controller.abort());
  renewal?.controller.abort();
  renewal = null;
  window.sessionStorage.removeItem(tokenStorageKey);
  window.sessionStorage.removeItem(flowStorageKey);
  window.sessionStorage.removeItem(completedFlowStorageKey);
}
export function rejectAccessToken(accessToken: string): boolean {
  if (readTokens()?.accessToken !== accessToken) return false;
  invalidateCredentials();
  reportSessionRecovery("signInRequired");
  return true;
}

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
  invalidateCredentials();
  window.sessionStorage.removeItem(completedLoginReturnPathStorageKey);
  resetSilentRecovery();
  resetSessionRecoveryDiagnostics();
}

export function storeTokens(tokens: TokenSet): void {
  credentialGeneration += 1;
  renewal?.controller.abort();
  renewal = null;
  window.sessionStorage.setItem(tokenStorageKey, JSON.stringify(tokens));
}

export async function startLogin(config = authConfig): Promise<void> {
  // Reserve interactive recovery before PKCE yields or the active room is released.
  reportSessionRecovery("recovering");
  resetSilentRecovery();
  window.sessionStorage.removeItem(skipSilentLoginStorageKey);
  const returnPath = currentLoginReturnPath();
  const redirectUri = getRedirectUri(config);
  const codeVerifier = createCodeVerifier();
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = createCodeVerifier();
  const language = currentApiLanguage();
  const flow: LoginFlow = { codeVerifier, state, redirectUri, returnPath };

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
  const flow: LoginFlow = { codeVerifier, state, redirectUri, silent: true, returnPath: returnPath === undefined ? currentLoginReturnPath() : safeReturnPath(returnPath) };

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
      reportSessionRecovery("signInRequired");
      throw new SilentLoginUnavailableError();
    }
    throw authProtocolError();
  }

  const recovery = window.sessionStorage.getItem(recoveryStorageKey);
  if (recovery) {
    try {
      const marker = JSON.parse(recovery) as { startedAt: number; origin: string };
      if (marker.origin !== window.location.origin || !Number.isFinite(marker.startedAt) || Date.now() - marker.startedAt > 60_000) {
        reportSessionRecovery("signInRequired");
        throw sessionRejectedError();
      }
    } catch { reportSessionRecovery("signInRequired"); throw sessionRejectedError(); }
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
  if (!tokens) return null;
  if (tokens.expiresAt > Date.now() + expirySkewMs) return tokens.accessToken;
  if (getSessionRecoveryPhase() === "unavailable") throw sessionUnavailableError();
  if (getSessionRecoveryPhase() === "protocolError") throw authProtocolError();
  if (!tokens.refreshToken) {
    rejectAccessToken(tokens.accessToken);
    throw sessionRejectedError();
  }
  const generation = credentialGeneration;
  const key = `${config.issuer}:${config.clientId}:${generation}`;
  if (renewal?.key === key) return renewal.promise;
  const controller = new AbortController();
  const promise = renewTokens(config, tokens, generation, controller);
  renewal = { key, promise, controller };
  try { return await promise; }
  finally { if (renewal?.promise === promise) renewal = null; }
}

async function renewTokens(config: AuthConfig, tokens: TokenSet, generation: number, controller: AbortController): Promise<string | null> {
  const startedAt = performance.now();
  reportSessionRecovery("recovering");
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const refreshed = await requestTokens(config, {
        grant_type: "refresh_token", client_id: config.clientId, refresh_token: tokens.refreshToken!,
      }, controller.signal);
      if (credentialGeneration !== generation || controller.signal.aborted) throw sessionChangedError();
      // Providers without rotation need not return a new refresh token.
      refreshed.refreshToken ??= tokens.refreshToken;
      refreshed.idToken ??= tokens.idToken;
      storeTokens(refreshed);
      reportSessionRecovery("ready", attempt, performance.now() - startedAt);
      return refreshed.accessToken;
    } catch (error) {
      if (credentialGeneration !== generation || controller.signal.aborted) throw sessionChangedError();
      if (error instanceof ApiError && error.errorCode === "SESSION_REJECTED") {
        rejectAccessToken(tokens.accessToken);
        throw error;
      }
      if (!(error instanceof ApiError) || error.errorCode !== "SESSION_UNAVAILABLE") {
        reportSessionRecovery("protocolError", attempt, performance.now() - startedAt);
        throw authProtocolError();
      }
      const delay = error instanceof AuthUnavailableError ? error.retryAfterMs : 1_000;
      if (attempt === 2 || performance.now() - startedAt + delay + authRequestDeadlineMs > renewalBudgetMs) {
        reportSessionRecovery("unavailable", attempt, performance.now() - startedAt);
        throw sessionUnavailableError();
      }
      await abortableDelay(delay, controller.signal);
    }
  }
  throw sessionUnavailableError();
}

class AuthUnavailableError extends ApiError {
  constructor(readonly retryAfterMs = 1_000) {
    const error = sessionUnavailableError();
    super(error.status, error.errorCode, error.message);
  }
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(sessionChangedError()); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(sessionChangedError()); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function requestTokens(config: AuthConfig, body: Record<string, string>, parentSignal?: AbortSignal): Promise<TokenSet> {
  const controller = new AbortController();
  authControllers.add(controller);
  const abort = () => controller.abort();
  if (parentSignal?.aborted) throw sessionChangedError();
  parentSignal?.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new AuthUnavailableError()); }, authRequestDeadlineMs);
  });
  const cancelled = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new AuthUnavailableError()), { once: true });
  });
  try {
    return await Promise.race([deadline, cancelled, (async () => {
      const response = await fetch(`${trimTrailingSlash(config.issuer)}/protocol/openid-connect/token`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body), signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) {
        const header = response.headers.get("Retry-After");
        const parsed = header === null ? NaN : Number(header);
        const retryAfterMs = header === null ? 1_000 : Number.isFinite(parsed)
          ? Math.max(1_000, parsed * 1000) : Math.max(1_000, Date.parse(header) - Date.now());
        throw new AuthUnavailableError(Number.isFinite(retryAfterMs) ? retryAfterMs : 1_000);
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
        if (error === "invalid_grant" || error === "invalid_token") throw sessionRejectedError();
        throw authProtocolError();
      }
      if (!payload || typeof payload !== "object" || !("access_token" in payload) || typeof payload.access_token !== "string"
        || !payload.access_token || !("expires_in" in payload) || typeof payload.expires_in !== "number"
        || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0
        || ("refresh_token" in payload && typeof payload.refresh_token !== "string")
        || ("id_token" in payload && typeof payload.id_token !== "string")) throw authProtocolError();
      return mapTokenResponse(payload as TokenResponse);
    })()]);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new AuthUnavailableError();
  } finally {
    clearTimeout(timer);
    authControllers.delete(controller);
    parentSignal?.removeEventListener("abort", abort);
  }
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
  return ["login_required", "interaction_required", "consent_required", "account_selection_required"].includes(error);
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

  const generation = credentialGeneration;
  let tokens: TokenSet;
  try {
    tokens = await requestTokens(config, {
      grant_type: "authorization_code", client_id: config.clientId, redirect_uri: flow.redirectUri,
      code, code_verifier: flow.codeVerifier,
    });
  } catch (error) {
    if (credentialGeneration !== generation) throw sessionChangedError();
    if (readLoginFlow()?.state === state) window.sessionStorage.removeItem(flowStorageKey);
    throw error;
  }
  if (credentialGeneration !== generation || readLoginFlow()?.state !== state) throw sessionChangedError();
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

function currentLoginReturnPath(): string {
  const { pathname, search, hash } = window.location;
  return pathname === "/auth/callback" ? "/" : safeReturnPath(`${pathname}${search}${hash}`);
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname === "/auth/callback") return "/";
    if (["token", "code", "state", "access_token", "refresh_token", "lesson_assertion"].some((key) => url.searchParams.has(key))) return "/";
    if (url.pathname === "/l" || url.pathname.startsWith("/lesson-access/")) return url.pathname;
    if (/(?:^|[&#])(?:token|code|state|access_token|refresh_token)=/i.test(url.hash)) return `${url.pathname}${url.search}`;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/"; }
}
