import {
  deleteMyUserProfile,
  getMe,
  getMyUserProfile,
  listStudentProfiles,
  listUserProfiles,
  updateMyUserProfile,
} from "../../generated/playsay-api";
import { authConfig } from "./auth";
import { apiErrorFromData } from "./errors";
import { apiJson, authorizedRequest } from "./http";
import type { AdminUserProfile, AppUserProfile, ManagedStudentInput, MeProfile, UpdateUserProfileInput } from "./types";

export async function fetchMe(config = authConfig): Promise<MeProfile> {
  const response = await authorizedRequest(config, (options) => getMe(options), 10_000);


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Profile request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchUserProfile(config = authConfig): Promise<AppUserProfile> {
  const response = await authorizedRequest(config, (options) => getMyUserProfile(options), 10_000);


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `User profile request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchAdminUserProfiles(config = authConfig): Promise<AdminUserProfile[]> {
  const response = await authorizedRequest(config, (options) => listUserProfiles(options));


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Admin users request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchStudentProfiles(config = authConfig): Promise<AdminUserProfile[]> {
  const response = await authorizedRequest(config, (options) => listStudentProfiles(options));


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Student profiles request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function createManagedStudentProfile(
  input: ManagedStudentInput,
  config = authConfig,
): Promise<AdminUserProfile> {
  return apiJson<AdminUserProfile>(
    "/api/students/managed",
    {
      body: JSON.stringify(input),
      method: "POST",
    },
    config,
    200,
  );
}

export async function saveUserProfile(
  input: UpdateUserProfileInput,
  config = authConfig,
): Promise<AppUserProfile> {
  const response = await authorizedRequest(config, (options) => updateMyUserProfile(input, options));


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `User profile update failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function resetUserProfile(config = authConfig): Promise<void> {
  const response = await authorizedRequest(config, (options) => deleteMyUserProfile(options));


  if (response.status !== 204) {
    throw apiErrorFromData(response.status, response.data as unknown, `User profile reset failed with HTTP ${response.status}.`);
  }
}
