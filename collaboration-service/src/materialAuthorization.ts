import type { CollaborationClaims } from "./rooms.js";

/** Revalidate material access independently of the lifetime of an issued websocket token. */
export async function requireMaterialAccess(
  config: { playsayApiBaseUrl: string; collaborationServiceToken: string },
  claims: CollaborationClaims,
): Promise<void> {
  const response = await fetch(new URL(`/internal/collaboration-documents/${claims.documentId}/policy`, config.playsayApiBaseUrl), {
    method: "POST",
    signal: AbortSignal.timeout(5_000),
    headers: { "content-type": "application/json", "x-playsay-collaboration-service-token": config.collaborationServiceToken },
    body: JSON.stringify({ subject: claims.subject }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("material access unavailable");
  }
  await response.body?.cancel();
}
