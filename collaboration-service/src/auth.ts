import { jwtVerify } from "jose";
import type { CollaborationClaims } from "./rooms.js";
import { validateCollaborationClaims } from "./rooms.js";

export interface CollaborationAuthConfig {
  tokenSecret: string;
}

export async function verifyCollaborationToken(
  token: string,
  config: CollaborationAuthConfig,
): Promise<CollaborationClaims> {
  const secret = config.tokenSecret.trim();
  if (secret.length < 32) {
    throw new Error("COLLABORATION_TOKEN_SECRET must be at least 32 characters");
  }

  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    issuer: "playsay-api-gateway",
  });

  return validateCollaborationClaims(payload);
}

export function tokenFromRequestUrl(url: URL): string {
  const token = url.searchParams.get("token")?.trim();
  if (!token) {
    throw new Error("missing token");
  }
  return token;
}
