import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../i18n";
import { apiErrorFromResponse, apiFetch, notAuthenticatedError } from "./errors";

afterEach(async () => {
  vi.restoreAllMocks();
  await i18n.changeLanguage("ru");
});

describe("localized keyboard API errors", () => {
  it.each([
    ["ru", "Не удалось выполнить запрос (код 500)."],
    ["en", "The request failed (code 500)."],
    ["de", "Die Anfrage ist fehlgeschlagen (Code 500)."],
    ["fr", "La requête a échoué (code 500)."],
  ])("localizes JSON and non-JSON HTTP fallbacks in %s", async (language, expected) => {
    await i18n.changeLanguage(language);

    await expect(apiErrorFromResponse(new Response("proxy failure", { status: 500 })))
      .resolves.toMatchObject({ status: 500, errorCode: "HTTP_ERROR", message: expected });
    await expect(apiErrorFromResponse(new Response(JSON.stringify({ errorCode: "INTERNAL", message: "raw error" }), { status: 500 })))
      .resolves.toMatchObject({ status: 500, errorCode: "INTERNAL", message: expected });
  });

  it("hides native network details and localizes authentication", async () => {
    await i18n.changeLanguage("de");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Load failed for proxy.local"));

    await expect(apiFetch("/api/test")).rejects.toMatchObject({
      status: 0,
      errorCode: "NETWORK_ERROR",
      message: "Der Server ist nicht erreichbar. Prüfen Sie die Verbindung und versuchen Sie es erneut.",
    });
    expect(notAuthenticatedError()).toMatchObject({
      status: 401,
      errorCode: "NOT_AUTHENTICATED",
      message: "Melden Sie sich an, um fortzufahren.",
    });
  });
});
