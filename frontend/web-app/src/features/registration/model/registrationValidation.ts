import { checkPassword, type PasswordCheck } from "./passwordPolicy";

export type RegistrationField = "email" | "password" | "passwordConfirm";
export type RegistrationValidationError =
  | "emailRequired"
  | "emailInvalid"
  | "passwordRequired"
  | "passwordInvalid"
  | "passwordConfirmRequired"
  | "passwordMismatch";

export type StartRegistrationValidation = {
  fieldErrors: Partial<Record<RegistrationField, RegistrationValidationError>>;
  firstInvalidField: RegistrationField | null;
  isValid: boolean;
  passwordCheck: PasswordCheck;
};

export function validateStartRegistration(
  email: string,
  password: string,
  passwordConfirm: string,
  displayName: string,
): StartRegistrationValidation {
  const fieldErrors: Partial<Record<RegistrationField, RegistrationValidationError>> = {};
  const normalizedEmail = email.trim();
  const passwordCheck = checkPassword(password, normalizedEmail, displayName);

  if (!normalizedEmail) {
    fieldErrors.email = "emailRequired";
  } else if (!isRegistrationEmailValid(normalizedEmail)) {
    fieldErrors.email = "emailInvalid";
  }

  if (!password) {
    fieldErrors.password = "passwordRequired";
  } else if (!passwordCheck.isValid) {
    fieldErrors.password = "passwordInvalid";
  }

  if (!passwordConfirm) {
    fieldErrors.passwordConfirm = "passwordConfirmRequired";
  } else if (password !== passwordConfirm) {
    fieldErrors.passwordConfirm = "passwordMismatch";
  }

  const firstInvalidField = registrationFieldOrder.find((field) => fieldErrors[field]) ?? null;
  return {
    fieldErrors,
    firstInvalidField,
    isValid: firstInvalidField === null,
    passwordCheck,
  };
}

function isRegistrationEmailValid(value: string): boolean {
  if (value.length > 320 || /\s/u.test(value)) {
    return false;
  }
  const separator = value.indexOf("@");
  return separator > 0 && separator === value.lastIndexOf("@") && separator < value.length - 1;
}

const registrationFieldOrder: RegistrationField[] = ["email", "password", "passwordConfirm"];
