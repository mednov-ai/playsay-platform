import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../i18n";
import { ApiError, apiErrorFromResponse, apiFetch, notAuthenticatedError } from "./errors";

afterEach(async () => {
  vi.restoreAllMocks();
  await i18n.changeLanguage("ru");
});

describe("localized API errors", () => {
  it.each([
    ["ru", "Не удалось выполнить запрос (код 500)."],
    ["en", "The request failed (code 500)."],
    ["de", "Die Anfrage ist fehlgeschlagen (Code 500)."],
    ["fr", "La requête a échoué (code 500)."],
  ])("localizes non-JSON HTTP errors in %s", async (language, expected) => {
    await i18n.changeLanguage(language);

    await expect(apiErrorFromResponse(new Response("proxy failure", { status: 500 }), "ignored"))
      .resolves.toMatchObject({ status: 500, errorCode: "HTTP_ERROR", message: expected });
  });

  it("preserves a localized project error returned by the API gateway", async () => {
    await i18n.changeLanguage("de");
    const response = new Response(JSON.stringify({ errorCode: "PAYMENT_FAILED", message: "Zahlung fehlgeschlagen." }), {
      status: 500,
    });

    await expect(apiErrorFromResponse(response, "ignored")).resolves.toMatchObject({
      status: 500,
      errorCode: "PAYMENT_FAILED",
      message: "Zahlung fehlgeschlagen.",
    });
  });

  it("preserves a stable project error code when the message is missing", async () => {
    await i18n.changeLanguage("en");
    const response = new Response(JSON.stringify({ errorCode: "PAYMENT_FAILED" }), { status: 500 });

    await expect(apiErrorFromResponse(response, "ignored")).resolves.toMatchObject({
      errorCode: "PAYMENT_FAILED",
      message: "The request failed (code 500).",
    });
  });

  it("does not expose the native fetch error", async () => {
    await i18n.changeLanguage("fr");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch internal.proxy.local"));

    await expect(apiFetch("/api/test")).rejects.toEqual(expect.objectContaining({
      status: 0,
      errorCode: "NETWORK_ERROR",
      message: "Impossible de joindre le serveur. Vérifiez la connexion et réessayez.",
    }));
  });

  it("returns a stable localized authentication error", async () => {
    await i18n.changeLanguage("en");
    const error = notAuthenticatedError();

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, errorCode: "NOT_AUTHENTICATED", message: "Sign in to continue." });
  });
});
