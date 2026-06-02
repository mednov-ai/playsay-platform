import {
  deleteMyUserProfile,
  getMe,
  getMyUserProfile,
  listStudentProfiles,
  listUserProfiles,
  updateMyUserProfile,
} from "../../generated/playsay-api";
import { authConfig, clearTokens } from "./auth";
import { apiErrorFromData } from "./errors";
import { authorizedOptions } from "./http";
import type { AdminUserProfile, AppUserProfile, MeProfile, UpdateUserProfileInput } from "./types";

export async function fetchMe(config = authConfig): Promise<MeProfile> {
  const response = await getMe(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Profile request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchUserProfile(config = authConfig): Promise<AppUserProfile> {
  const response = await getMyUserProfile(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `User profile request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchAdminUserProfiles(config = authConfig): Promise<AdminUserProfile[]> {
  const response = await listUserProfiles(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Admin users request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchStudentProfiles(config = authConfig): Promise<AdminUserProfile[]> {
  const response = await listStudentProfiles(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Student profiles request failed with HTTP ${response.status}.`);
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
    throw apiErrorFromData(response.status, response.data as unknown, `User profile update failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function resetUserProfile(config = authConfig): Promise<void> {
  const response = await deleteMyUserProfile(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 204) {
    throw apiErrorFromData(response.status, response.data as unknown, `User profile reset failed with HTTP ${response.status}.`);
  }
}
