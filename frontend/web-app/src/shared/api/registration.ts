import {
  confirmRegistration,
  resendRegistration,
  startRegistration,
  type ConfirmRegistrationRequest,
  type RegistrationResponse,
  type ResendRegistrationRequest,
  type StartRegistrationRequest,
} from "../../generated/registration-api";

export type RegistrationStartInput = StartRegistrationRequest;
export type RegistrationResendInput = ResendRegistrationRequest;
export type RegistrationConfirmInput = ConfirmRegistrationRequest;
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
