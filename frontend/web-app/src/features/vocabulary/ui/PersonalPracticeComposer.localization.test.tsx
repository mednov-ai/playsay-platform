// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changeAppLanguage, i18n } from "../../../shared/i18n";
import { PersonalPracticeComposer } from "./PersonalPracticeComposer";

vi.mock("../../../shared/api/playsay", () => ({
  fetchVocabularyDashboard: vi.fn().mockResolvedValue({ entries: [] }),
  fetchVocabularySelectionRecipes: vi.fn().mockResolvedValue([]),
  previewVocabularyPractice: vi.fn().mockResolvedValue({
    categoryCounts: { DUE: 2 }, owners: [], planId: "synthetic-plan", revision: 1,
  }),
}));

const owners = [{ subject: "student-fixture", name: "Student" }];
afterEach(() => { cleanup(); });

describe("practice category translations", () => {
  it.each([
    ["ru", "К повторению"], ["en", "Due"], ["de", "Fällig"], ["fr", "À réviser"],
  ])("renders the DUE count and named group in %s", async (language, label) => {
    await changeAppLanguage(language);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>
      <PersonalPracticeComposer actionLabel="Start" delivery="LIVE" onPublish={vi.fn()} owners={owners} />
    </QueryClientProvider>);
    const group = await screen.findByRole("group", { name: i18n.t("vocabulary.practice.composer.categorySummary") });
    expect(group).toHaveTextContent(`${label} · 2`);
    expect(group).not.toHaveTextContent("vocabulary.practice.reason.DUE");
  });
});
