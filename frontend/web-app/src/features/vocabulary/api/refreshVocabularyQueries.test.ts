import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { refreshVocabularyQueries } from "./refreshVocabularyQueries";
it("invalidates the affected owner and previews without invalidating another learner", async () => {
 const client = new QueryClient();
 const own = ["vocabulary-dashboard", "a", "book"];
 const foreign = ["vocabulary-dashboard", "b", "book"];
 const preview = ["vocabulary-practice-preview-v2", JSON.stringify({ selectedSubjects: ["a", "b"] })];
 const foreignPreview = ["vocabulary-practice-preview-v2", JSON.stringify({ selectedSubjects: ["b"] })];
 for (const key of [own, foreign, preview, foreignPreview]) client.setQueryData(key, {});
 await refreshVocabularyQueries(client, "a");
 expect(client.getQueryState(own)?.isInvalidated).toBe(true);
 expect(client.getQueryState(preview)?.isInvalidated).toBe(true);
 expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
 expect(client.getQueryState(foreignPreview)?.isInvalidated).toBe(false);
 client.clear();
});
