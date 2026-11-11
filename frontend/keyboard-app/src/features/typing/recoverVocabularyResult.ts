import type { SubmitResult } from "../../shared/types";

export async function recoverVocabularyResult<T>(
  result: SubmitResult,
  verifyOwner: (sessionId: string) => Promise<unknown>,
  submit: (result: SubmitResult) => Promise<T>,
  stillActive: () => boolean,
): Promise<T | null> {
  const sessionId = result.practiceContext?.vocabularySessionId;
  if (!sessionId) return null;
  await verifyOwner(sessionId);
  if (!stillActive()) return null;
  return submit(result);
}
