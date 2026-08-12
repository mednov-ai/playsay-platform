import {
  deleteMyPasskey,
  getMyAuthenticationMethods,
  renameMyPasskey,
} from "../../generated/playsay-api";
import { authConfig, clearTokens } from "./auth";
import { apiErrorFromData } from "./errors";
import { authorizedOptions } from "./http";
import type { AuthenticationMethods, RenamePasskeyInput } from "./types";

export async function fetchAuthenticationMethods(config = authConfig): Promise<AuthenticationMethods> {
  const response = await getMyAuthenticationMethods(await authorizedOptions(config));
  return authenticationMethodsResponse(response, "Authentication methods request");
}

export async function renameAuthenticationPasskey(
  credentialId: string,
  input: RenamePasskeyInput,
  config = authConfig,
): Promise<AuthenticationMethods> {
  const response = await renameMyPasskey(credentialId, input, await authorizedOptions(config));
  return authenticationMethodsResponse(response, "Passkey rename request");
}

export async function deleteAuthenticationPasskey(
  credentialId: string,
  config = authConfig,
): Promise<AuthenticationMethods> {
  const response = await deleteMyPasskey(credentialId, await authorizedOptions(config));
  return authenticationMethodsResponse(response, "Passkey delete request");
}

function authenticationMethodsResponse(
  response: { status: number; data: unknown },
  operation: string,
): AuthenticationMethods {
  if (response.status === 401) {
    clearTokens();
  }
  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data, `${operation} failed with HTTP ${response.status}.`);
  }
  return response.data as AuthenticationMethods;
}
