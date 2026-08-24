import { describe, expect, it } from "vitest";
import { validateStartRegistration } from "./registrationValidation";

describe("start registration validation", () => {
  it("reports required fields in focus order", () => {
    const result = validateStartRegistration("", "", "", "");

    expect(result.isValid).toBe(false);
    expect(result.firstInvalidField).toBe("email");
    expect(result.fieldErrors).toEqual({
      email: "emailRequired",
      password: "passwordRequired",
      passwordConfirm: "passwordConfirmRequired",
    });
  });

  it("distinguishes malformed email, policy failure, and password mismatch", () => {
    const result = validateStartRegistration("invalid", "lowercase", "different", "Learner");

    expect(result.fieldErrors).toEqual({
      email: "emailInvalid",
      password: "passwordInvalid",
      passwordConfirm: "passwordMismatch",
    });
  });

  it("accepts a complete valid form", () => {
    const result = validateStartRegistration(
      " learner@example.test ",
      "River2026!",
      "River2026!",
      "Learner",
    );

    expect(result.isValid).toBe(true);
    expect(result.firstInvalidField).toBeNull();
    expect(result.fieldErrors).toEqual({});
  });
});
