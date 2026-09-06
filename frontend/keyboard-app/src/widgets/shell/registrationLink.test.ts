import { describe, expect, it } from "vitest";
import { registrationUrlForKeyboard } from "./registrationLink";

describe("registrationUrlForKeyboard", () => {
  it("points keyboard guests to the online registration page with return target", () => {
    expect(registrationUrlForKeyboard("https://key.play-and-say.ru/")).toBe(
      "https://online.play-and-say.ru/register?returnTo=https%3A%2F%2Fkey.play-and-say.ru%2F",
    );
  });

  it("keeps the regional dev registration on the regional dev origin", () => {
    expect(registrationUrlForKeyboard("https://dev.key.honeyschool.ru/")).toBe(
      "https://dev.online.honeyschool.ru/register?returnTo=https%3A%2F%2Fdev.key.honeyschool.ru%2F",
    );
  });

  it("keeps production honey registration and returnTo on production hosts", () => {
    expect(registrationUrlForKeyboard("https://key.honey.school/")).toBe(
      "https://online.honey.school/register?returnTo=https%3A%2F%2Fkey.honey.school%2F",
    );
  });

  it("keeps development honey registration and returnTo on development hosts", () => {
    expect(registrationUrlForKeyboard("https://dev.key.honey.school/")).toBe(
      "https://dev.online.honey.school/register?returnTo=https%3A%2F%2Fdev.key.honey.school%2F",
    );
  });
});
