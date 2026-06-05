import { describe, expect, it } from "vitest";
import { registrationUrlForKeyboard } from "./registrationLink";

describe("registrationUrlForKeyboard", () => {
  it("points keyboard guests to the online registration page with return target", () => {
    expect(registrationUrlForKeyboard("https://key.play-and-say.ru/")).toBe(
      "https://online.play-and-say.ru/register?returnTo=https%3A%2F%2Fkey.play-and-say.ru%2F",
    );
  });
});
