import { createHash, randomUUID } from "node:crypto";

export const MEDIA_PLACEHOLDER_PREFIX = "playsay-media-placeholder:v1:";
export const MEDIA_INDIVIDUAL_TRIGGER_BYTES = 256 * 1024;
export const MEDIA_AGGREGATE_TRIGGER_BYTES = 1024 * 1024;
export const MAX_PROTECTED_MEDIA_RESOURCES = 128;
export const MAX_PROTECTED_MEDIA_BYTES = 20 * 1024 * 1024;

type MediaManifestEntry = {
  digest: string;
  source: string;
  token: string;
};

type MediaSpan = {
  end: number;
  payload: string;
  source: string;
  start: number;
};

export type MediaProtectionSummary = {
  aiInputBytes: number;
  extractedBytes: number;
  inputBytes: number;
  resourceCount: number;
  status: "not_needed" | "protected";
};

export type ProtectedMediaForAi = {
  html: string;
  manifest: MediaManifestEntry[];
  summary: MediaProtectionSummary;
};

export class MediaProtectionError extends Error {
  constructor(reason: string) {
    super(`ADAPTED_HTML_MEDIA_INTEGRITY_INVALID: ${reason}`);
  }
}

type ProtectionOptions = {
  maxExtractedBytes?: number;
  maxResources?: number;
  tokenFactory?: (index: number) => string;
};

const embeddedMediaPattern =
  /data:(?:image|audio)\/[a-z0-9.+-]+(?:;[a-z0-9!#$&^_.+-]+=[a-z0-9!#$&^_.+-]+)*;base64,([^"'`\s)<>,;]+)/giu;

export function protectMediaForAi(
  html: string,
  options: ProtectionOptions = {},
): ProtectedMediaForAi {
  if (html.includes(MEDIA_PLACEHOLDER_PREFIX)) {
    throw new MediaProtectionError("reserved placeholder namespace is present in source");
  }
  const inputBytes = Buffer.byteLength(html);
  const spans = scanMediaSpans(html);
  const aggregateBytes = spans.reduce((sum, span) => sum + Buffer.byteLength(span.source), 0);
  const triggered = aggregateBytes >= MEDIA_AGGREGATE_TRIGGER_BYTES || spans.some(
    (span) => Buffer.byteLength(span.source) >= MEDIA_INDIVIDUAL_TRIGGER_BYTES,
  );
  if (!triggered) {
    return {
      html,
      manifest: [],
      summary: {
        aiInputBytes: inputBytes,
        extractedBytes: 0,
        inputBytes,
        resourceCount: 0,
        status: "not_needed",
      },
    };
  }

  const maxResources = options.maxResources ?? MAX_PROTECTED_MEDIA_RESOURCES;
  const maxExtractedBytes = options.maxExtractedBytes ?? MAX_PROTECTED_MEDIA_BYTES;
  if (spans.length > maxResources || aggregateBytes > maxExtractedBytes) {
    throw new MediaProtectionError("media protection bounds exceeded");
  }

  const tokenFactory = options.tokenFactory ?? ((index: number) => (
    `${MEDIA_PLACEHOLDER_PREFIX}${index}:${randomUUID()}`
  ));
  const manifest: MediaManifestEntry[] = [];
  let reduced = "";
  let cursor = 0;
  for (const [index, span] of spans.entries()) {
    strictBase64Decode(span.payload);
    const token = tokenFactory(index);
    if (!token.startsWith(MEDIA_PLACEHOLDER_PREFIX) || token.includes(span.source) || reduced.includes(token)) {
      throw new MediaProtectionError("invalid or repeated placeholder token");
    }
    reduced += html.slice(cursor, span.start);
    reduced += token;
    cursor = span.end;
    manifest.push({ digest: digest(span.source), source: span.source, token });
  }
  reduced += html.slice(cursor);

  return {
    html: reduced,
    manifest,
    summary: {
      aiInputBytes: Buffer.byteLength(reduced),
      extractedBytes: aggregateBytes,
      inputBytes,
      resourceCount: manifest.length,
      status: "protected",
    },
  };
}

export function restoreMediaAfterAi(candidateHtml: string, protectedMedia: ProtectedMediaForAi): string {
  let restored = candidateHtml;
  for (const entry of protectedMedia.manifest) {
    const tokenIndex = restored.indexOf(entry.token);
    const before = tokenIndex > 0 ? restored[tokenIndex - 1] : "";
    const after = tokenIndex >= 0 ? restored[tokenIndex + entry.token.length] ?? "" : "";
    if (
      occurrences(restored, entry.token) !== 1 ||
      /[A-Za-z0-9_-]/u.test(before) ||
      /[A-Za-z0-9_-]/u.test(after) ||
      digest(entry.source) !== entry.digest
    ) {
      throw new MediaProtectionError("placeholder is missing, changed or duplicated");
    }
    restored = restored.replace(entry.token, entry.source);
  }
  if (restored.includes(MEDIA_PLACEHOLDER_PREFIX)) {
    throw new MediaProtectionError("unissued or altered placeholder is present");
  }
  return restored;
}

function scanMediaSpans(html: string): MediaSpan[] {
  const spans: MediaSpan[] = [];
  for (const match of html.matchAll(embeddedMediaPattern)) {
    const start = match.index;
    if (start === undefined) continue;
    const source = match[0];
    const end = start + source.length;
    if (match[1].includes("${") || match[1].includes("\\") || /^(?:\$\{|["'`]\s*\+)/u.test(html.slice(end))) {
      continue;
    }
    spans.push({ end, payload: match[1], source, start });
  }
  return spans;
}

function strictBase64Decode(payload: string): Buffer {
  if (
    payload.length === 0 ||
    payload.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(payload)
  ) {
    throw new MediaProtectionError("embedded media base64 is invalid");
  }
  const decoded = Buffer.from(payload, "base64");
  if (decoded.toString("base64") !== payload) {
    throw new MediaProtectionError("embedded media base64 is non-canonical");
  }
  return decoded;
}

function occurrences(value: string, token: string): number {
  let count = 0;
  let cursor = 0;
  while ((cursor = value.indexOf(token, cursor)) >= 0) {
    count += 1;
    cursor += token.length;
  }
  return count;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
