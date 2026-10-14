// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VocabularyEntry, VocabularyMediaView } from "../../../shared/api/playsay";
import { VocabularyMediaCard } from "./VocabularyMediaCard";

const fetchMedia = vi.fn();
const fetchBlob = vi.fn();
const regenerate = vi.fn();
const report = vi.fn();
const updateOverride = vi.fn();

vi.mock("../../../shared/api/playsay", () => ({
  fetchVocabularyEntryMedia: (...args: unknown[]) => fetchMedia(...args),
  fetchVocabularyMediaBlob: (...args: unknown[]) => fetchBlob(...args),
  regenerateVocabularyEntryMedia: (...args: unknown[]) => regenerate(...args),
  reportVocabularyEntryMedia: (...args: unknown[]) => report(...args),
  updateVocabularyEntryMediaOverride: (...args: unknown[]) => updateOverride(...args),
}));

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }),
}));

beforeEach(() => {
  fetchMedia.mockReset(); fetchBlob.mockReset(); regenerate.mockReset(); report.mockReset(); updateOverride.mockReset();
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:approved"), revokeObjectURL: vi.fn() });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("VocabularyMediaCard", () => {
  it.each(["UNRESOLVED_PRIVATE", "GENERATING", "FAILED", "TEXT_ONLY", "NO_IMAGE", "HIDDEN"] as const)("keeps a stable text fallback for %s", async (state) => {
    fetchMedia.mockResolvedValue(view(state));
    renderCard();
    expect(await screen.findByText(`vocabulary.media.state.${state}`)).toBeInTheDocument();
    expect(screen.getByLabelText("vocabulary.media.region").querySelector(".vocabulary-media-card__viewport")).toBeInTheDocument();
  });

  it("renders an approved authenticated blob with meaningful alt text and reports the wrong sense", async () => {
    const approved = view("APPROVED");
    fetchMedia.mockResolvedValue(approved);
    fetchBlob.mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    report.mockResolvedValue(view("HIDDEN"));
    renderCard();
    expect(await screen.findByAltText("An apple on a table")).toHaveAttribute("src", "blob:approved");
    fireEvent.click(screen.getByRole("button", { name: "vocabulary.media.wrongAria" }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("entry-1", "asset-1"));
    expect(await screen.findByText("vocabulary.media.state.HIDDEN")).toBeInTheDocument();
  });

  it("offers explicit regeneration without hiding the current approved candidate", async () => {
    fetchMedia.mockResolvedValue(view("APPROVED"));
    fetchBlob.mockResolvedValue(new Blob(["image"]));
    regenerate.mockResolvedValue({ ...view("APPROVED"), generationPending: true });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "vocabulary.media.regenerate" }));
    await waitFor(() => expect(regenerate).toHaveBeenCalledWith("entry-1"));
    expect(screen.getByAltText("An apple on a table")).toBeInTheDocument();
  });

  it("uses a neutral inaccessible state when authorized delivery fails", async () => {
    fetchMedia.mockResolvedValue(view("APPROVED"));
    fetchBlob.mockRejectedValue(new Error("forbidden"));
    renderCard();
    expect(await screen.findByText("vocabulary.media.inaccessible")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><VocabularyMediaCard entry={entry} /></QueryClientProvider>);
}

const entry: VocabularyEntry = { id: "entry-1", sourceText: "apple", sourceLanguage: "en", targetLanguage: "ru", translationState: "CONFIRMED", status: "ACTIVE", practicePaused: false, occurrences: [], createdAt: "2026-08-21T00:00:00Z", updatedAt: "2026-08-21T00:00:00Z" };

function view(state: VocabularyMediaView["state"]): VocabularyMediaView {
  const approved = state === "APPROVED";
  return {
    entryId: entry.id,
    senseId: state === "UNRESOLVED_PRIVATE" ? null : "sense-1",
    imageability: state === "TEXT_ONLY" ? "NON_IMAGEABLE" : "IMAGEABLE",
    state,
    generationPending: state === "GENERATING",
    hidden: state === "HIDDEN",
    alternatives: [],
    asset: approved ? { id: "asset-1", senseId: "sense-1", state: "APPROVED", contentUrl: "/content", contentType: "image/png", origin: "GENERATED", safetyState: "SAFE", altText: { en: "An apple on a table" }, decorative: false, createdAt: "2026-08-21T00:00:00Z", reviewHistory: [] } : null,
  };
}
