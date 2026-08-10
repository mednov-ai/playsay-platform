export {
  authConfig,
  buildAccountConsoleUrl,
  buildAuthorizeUrl,
  buildLogoutUrl,
  clearTokens,
  completeLogin,
  consumeCompletedAuthAction,
  consumeSkipSilentLogin,
  defaultAuthIssuer,
  getValidAccessToken,
  isSilentLoginUnavailable,
  isAuthCallback,
  mapTokenResponse,
  readTokens,
  skipSilentLoginOnce,
  startLogin,
  startPasskeyRegistration,
  startSilentLogin,
  storeTokens,
} from "../api/auth";

export type {
  AuthConfig,
  CompletedAuthAction,
  PasskeyAuthAction,
  TokenSet,
} from "../api/auth";
