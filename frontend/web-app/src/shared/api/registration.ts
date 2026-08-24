import {
  confirmRegistration,
  forgotPassword,
  resendRegistration,
  resetPassword,
  startRegistration,
  type ConfirmRegistrationRequest,
  type ForgotPasswordRequest,
  type RegistrationResponse,
  type ResetPasswordRequest,
  type ResendRegistrationRequest,
  type StartRegistrationRequest,
} from "../../generated/registration-api";
import { ApiError, isApiStatus } from "./errors";
import { publicApiJson } from "./http";
import type { StudentInviteConsumeResult } from "./types";

export type RegistrationStartInput = StartRegistrationRequest;
export type RegistrationResendInput = ResendRegistrationRequest;
export type RegistrationConfirmInput = ConfirmRegistrationRequest;
export type ForgotPasswordInput = ForgotPasswordRequest;
export type ResetPasswordInput = ResetPasswordRequest;
export type RegistrationResult = RegistrationResponse;

export async function startRegistrationRequest(input: RegistrationStartInput): Promise<RegistrationResult> {
  const response = await startRegistration(input);
  if (response.status !== 202) {
    throw registrationRequestError(response.status, `Registration failed with HTTP ${response.status}.`);
  }
  return response.data;
}

export async function resendRegistrationRequest(input: RegistrationResendInput): Promise<RegistrationResult> {
  const response = await resendRegistration(input);
  if (response.status !== 202) {
    throw registrationRequestError(response.status, `Registration resend failed with HTTP ${response.status}.`);
  }
  return response.data;
}

export async function confirmRegistrationRequest(input: RegistrationConfirmInput): Promise<RegistrationResult> {
  const response = await confirmRegistration(input);
  if (response.status !== 200) {
    throw registrationRequestError(response.status, `Registration confirmation failed with HTTP ${response.status}.`);
  }
  return response.data;
}

export async function forgotPasswordRequest(input: ForgotPasswordInput): Promise<RegistrationResult> {
  const response = await forgotPassword(input);
  if (response.status !== 202) {
    throw registrationRequestError(response.status, `Password reset request failed with HTTP ${response.status}.`);
  }
  return response.data;
}

export async function resetPasswordRequest(input: ResetPasswordInput): Promise<RegistrationResult> {
  const response = await resetPassword(input);
  if (response.status !== 200) {
    throw registrationRequestError(response.status, `Password reset failed with HTTP ${response.status}.`);
  }
  return response.data;
}

export async function consumeStudentInviteRequest(token: string): Promise<StudentInviteConsumeResult> {
  return publicApiJson<StudentInviteConsumeResult>(
    "/api/student-invites/consume",
    {
      body: JSON.stringify({ token }),
      method: "POST",
    },
    200,
  );
}

export function isRegistrationRateLimitError(caught: unknown): boolean {
  return isApiStatus(caught, 429);
}

export function isRegistrationContractError(caught: unknown): boolean {
  return isApiStatus(caught, 400) || isApiStatus(caught, 422);
}

export function isRegistrationUnavailableError(caught: unknown): boolean {
  if (caught instanceof TypeError) {
    return true;
  }
  return [0, 502, 503, 504].some((status) => isApiStatus(caught, status));
}

function registrationRequestError(status: number, message: string): ApiError {
  return new ApiError(
    status,
    status === 429 ? "REGISTRATION_RATE_LIMITED" : "REGISTRATION_REQUEST_FAILED",
    message,
  );
}
