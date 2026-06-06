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

export type RegistrationStartInput = StartRegistrationRequest;
export type RegistrationResendInput = ResendRegistrationRequest;
export type RegistrationConfirmInput = ConfirmRegistrationRequest;
export type ForgotPasswordInput = ForgotPasswordRequest;
export type ResetPasswordInput = ResetPasswordRequest;
export type RegistrationResult = RegistrationResponse;

export async function startRegistrationRequest(input: RegistrationStartInput): Promise<RegistrationResult> {
  const response = await startRegistration(input);
  if (response.status !== 202) {
    throw new Error(`Registration failed with HTTP ${response.status}.`);
  }
  return response.data;
}

export async function resendRegistrationRequest(input: RegistrationResendInput): Promise<RegistrationResult> {
  const response = await resendRegistration(input);
  if (response.status !== 202) {
    throw new Error(`Registration resend failed with HTTP ${response.status}.`);
  }
  return response.data;
}

export async function confirmRegistrationRequest(input: RegistrationConfirmInput): Promise<RegistrationResult> {
  const response = await confirmRegistration(input);
  if (response.status !== 200) {
    throw new Error(`Registration confirmation failed with HTTP ${response.status}.`);
  }
  return response.data;
}

export async function forgotPasswordRequest(input: ForgotPasswordInput): Promise<RegistrationResult> {
  const response = await forgotPassword(input);
  if (response.status !== 202) {
    throw new Error(`Password reset request failed with HTTP ${response.status}.`);
  }
  return response.data;
}

export async function resetPasswordRequest(input: ResetPasswordInput): Promise<RegistrationResult> {
  const response = await resetPassword(input);
  if (response.status !== 200) {
    throw new Error(`Password reset failed with HTTP ${response.status}.`);
  }
  return response.data;
}
