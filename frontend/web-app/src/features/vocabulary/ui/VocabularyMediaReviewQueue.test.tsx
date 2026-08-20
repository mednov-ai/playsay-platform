// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VocabularyMediaReviewQueue } from "./VocabularyMediaReviewQueue";

const fetchCandidates = vi.fn();
const reviewCandidate = vi.fn();

vi.mock("../../../shared/api/playsay", () => ({
  fetchVocabularyMediaCandidates: (...args: unknown[]) => fetchCandidates(...args),
  reviewVocabularyMediaCandidate: (...args: unknown[]) => reviewCandidate(...args),
}));
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => {
  fetchCandidates.mockReset().mockResolvedValue([{ id: "asset-1", senseId: "sense-123456", state: "CANDIDATE", contentUrl: "/candidate", origin: "GENERATED", generatorType: "OPENAI", generatorModel: "image-v1", promptTemplateVersion: "vocabulary-image-v1", safetyState: "SAFE", altText: { en: "An apple" }, decorative: false, createdAt: "2026-08-21T00:00:00Z", reviewHistory: [] }]);
  reviewCandidate.mockReset().mockResolvedValue({ id: "asset-1", state: "APPROVED" });
});
afterEach(cleanup);

describe("VocabularyMediaReviewQueue", () => {
  it("shows sense, provenance, safety and alt text before an explicit review action", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><VocabularyMediaReviewQueue /></QueryClientProvider>);
    expect(await screen.findByText(/OPENAI · image-v1/)).toBeInTheDocument();
    expect(screen.getByText("SAFE")).toBeInTheDocument();
    expect(screen.getByText("An apple")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "vocabulary.media.review.approve" }));
    await waitFor(() => expect(reviewCandidate).toHaveBeenCalledWith("asset-1", { action: "APPROVE", reasonCode: undefined }));
  });
});
