import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { i18n } from "../../shared/i18n/config";
import { VocabularyEmptyResume } from "./VocabularyEmptyResume";

describe("empty vocabulary resume", () => {
  it.each([
    ["ru", "Нет доступных целей"],
    ["en", "No typing targets are available"],
    ["de", "Es sind keine Tippziele verfügbar"],
    ["fr", "Aucun objectif de saisie disponible"],
  ])("offers an honest return path in %s", async (language, message) => {
    await i18n.changeLanguage(language);
    const markup = renderToStaticMarkup(<I18nextProvider i18n={i18n}>
      <VocabularyEmptyResume href="https://example.invalid/vocabulary" target="HONEY_SCHOOL_VOCABULARY" />
    </I18nextProvider>);
    expect(markup).toContain(message);
    expect(markup).toContain('href="https://example.invalid/vocabulary"');
    expect(markup).not.toContain("trainer.vocabulary");
  });

  it.each([
    ["ru", "Все цели набора сохранены"],
    ["en", "All typing targets have been recorded"],
    ["de", "Alle Tippziele wurden gespeichert"],
    ["fr", "Tous les objectifs de saisie ont été enregistrés"],
  ])("reports recorded targets without claiming the parent practice is complete in %s", async (language, message) => {
    await i18n.changeLanguage(language);
    const markup = renderToStaticMarkup(<I18nextProvider i18n={i18n}>
      <VocabularyEmptyResume href="https://example.invalid/vocabulary" allTargetsRecorded />
    </I18nextProvider>);
    expect(markup).toContain(message);
    expect(markup).not.toContain("trainer.vocabulary");
  });

  it.each([
    ["ru", "Нет соединения", "Повторить сохранение"],
    ["en", "Connection unavailable", "Retry saving"],
    ["de", "Keine Verbindung", "Erneut speichern"],
    ["fr", "Connexion indisponible", "Réessayer l’enregistrement"],
  ])("explains pending delivery and retry in %s", async (language, message, retry) => {
    await i18n.changeLanguage(language);
    const markup = renderToStaticMarkup(<I18nextProvider i18n={i18n}>
      <VocabularyEmptyResume href="https://example.invalid/vocabulary" deliveryStatus="offline" onRetry={() => {}} />
    </I18nextProvider>);
    expect(markup).toContain(message);
    expect(markup).toContain(retry);
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("trainer.vocabulary");
  });
});
