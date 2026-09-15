import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { adaptGameHtml } from "./adapter.js";
import {
  IMAGE_OPTIMIZATION_POLICY,
  ImageOptimizationError,
  optimizeEmbeddedImages,
} from "./image-optimizer.js";
import {
  closeRuntimeValidator,
  MECHANICS_VALIDATOR_VERSION,
} from "./runtime-validator.js";

const port = Number(process.env.PORT ?? 8088);
const adaptationRequestLimit = 7 * 1024 * 1024;
const optimizationRequestLimit = 24 * 1024 * 1024;
export const optimizationDeadlineMs = 30_000;

export function createGameAdapterServer(
  adapt: typeof adaptGameHtml = adaptGameHtml,
  optimize: typeof optimizeEmbeddedImages = optimizeEmbeddedImages,
  deadlineMs = optimizationDeadlineMs,
) {
  return createServer(async (request, response) => {
    const isOptimization = request.method === "POST" && request.url === "/internal/html-game-optimizations";
    try {
      if (request.method === "GET" && request.url === "/actuator/health") {
        return json(response, 200, { status: "UP" });
      }
      const isAdaptation = request.method === "POST" && request.url === "/internal/game-adaptations";
      if (!isAdaptation && !isOptimization) {
        return json(response, 404, { code: "NOT_FOUND" });
      }
      if (!authorized(request)) {
        return json(response, 401, { code: "UNAUTHORIZED", retryable: false });
      }
      const body = JSON.parse(await readBody(
        request,
        isOptimization ? optimizationRequestLimit : adaptationRequestLimit,
      )) as { html?: unknown; policy?: unknown };
      if (typeof body.html !== "string") {
        return json(response, 400, { code: "HTML_REQUIRED", retryable: false });
      }
      if (isOptimization) {
        if (body.policy !== IMAGE_OPTIMIZATION_POLICY) {
          return json(response, 400, { code: "OPTIMIZATION_POLICY_UNSUPPORTED", retryable: false });
        }
        const result = await withDeadline(optimize(body.html, body.policy), deadlineMs);
        console.info(JSON.stringify({
          event: "html_game_image_optimization",
          status: result.status,
          durationMs: result.durationMs,
          inputBytes: result.inputBytes,
          outputBytes: result.outputBytes,
          eligibleCount: result.eligibleCount,
          replacedCount: result.replacedCount,
          bytesSaved: result.bytesSaved,
        }));
        return json(response, 200, result);
      }
      const result = await adapt(body.html);
      if (result.mediaProtection) {
        console.info(JSON.stringify({
          event: "game_adaptation_media_protection",
          ...result.mediaProtection,
        }));
      }
      return json(response, 200, result);
    } catch (error) {
      if (error instanceof ImageOptimizationError) {
        const code = error.code === "IMAGE_LIMIT_EXCEEDED" ? "IMAGE_LIMIT_EXCEEDED" : "IMAGE_INVALID";
        console.warn(JSON.stringify({ event: "html_game_image_optimization_failed", code }));
        return json(response, 422, { code, retryable: false });
      }
      if (error instanceof Error && error.message === "OPTIMIZATION_TIMEOUT") {
        console.warn(JSON.stringify({ event: "html_game_image_optimization_failed", code: "OPTIMIZATION_TIMEOUT" }));
        return json(response, 503, { code: "OPTIMIZATION_TIMEOUT", retryable: true });
      }
      const raw = error instanceof Error ? error.message : "ADAPTATION_FAILED";
      if (isOptimization) {
        if (raw === "REQUEST_TOO_LARGE") {
          return json(response, 413, { code: raw, retryable: false });
        }
        if (error instanceof SyntaxError) {
          return json(response, 400, { code: "INVALID_JSON", retryable: false });
        }
        console.warn(JSON.stringify({ event: "html_game_image_optimization_failed", code: "OPTIMIZATION_FAILED" }));
        return json(response, 503, { code: "OPTIMIZATION_FAILED", retryable: true });
      }
      const failure = classifyFailure(raw);
      if (failure.code === "ADAPTED_HTML_MEDIA_INTEGRITY_INVALID") {
        console.warn(JSON.stringify({
          event: "game_adaptation_media_protection_failed",
          code: failure.code,
        }));
      }
      return json(response, failure.status, {
        code: failure.code,
        retryable: failure.retryable,
        validation: {
          failureCode: failure.failureCode,
          mechanicsEquivalent: false,
          validatorVersion: MECHANICS_VALIDATOR_VERSION,
        },
      });
    }
  });
}

function authorized(request: IncomingMessage): boolean {
  const expected = process.env.PLAY_SAY_GAME_ADAPTER_SERVICE_TOKEN?.trim() ?? "";
  const supplied = String(request.headers["x-playsay-game-adapter-token"] ?? "");
  if (expected.length < 24 || supplied.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

async function readBody(request: IncomingMessage, requestLimit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > requestLimit) {
      throw new Error("REQUEST_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function withDeadline<T>(work: Promise<T>, deadlineMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("OPTIMIZATION_TIMEOUT")), deadlineMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const content = JSON.stringify(body);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(content),
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(content);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const server = createGameAdapterServer().listen(port, "0.0.0.0");
  const shutdown = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeRuntimeValidator();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

function classifyFailure(raw: string): {
  code: string;
  failureCode: string;
  retryable: boolean;
  status: number;
} {
  const failureCodes = raw.match(/\b(?:ACTION|ADAPTED_HTML|GAME|NETWORK|RANGE|RUNTIME|VALIDATION)_[A-Z_]+\b/g);
  const failureCode = (failureCodes?.at(-1) ?? "ADAPTATION_FAILED").slice(0, 120);
  if (raw === "REQUEST_TOO_LARGE") {
    return { code: raw, failureCode: raw, retryable: false, status: 413 };
  }
  if (raw.startsWith("OPENAI_")) {
    if (
      raw === "OPENAI_API_KEY_NOT_CONFIGURED" ||
      raw === "OPENAI_RESPONSE_MISSING" ||
      raw === "OPENAI_RESPONSE_INVALID"
    ) {
      return { code: raw, failureCode, retryable: true, status: 503 };
    }
    const status = Number(raw.slice("OPENAI_".length));
    const retryable = status === 429 || status >= 500;
    return { code: raw.slice(0, 120), failureCode, retryable, status: retryable ? 503 : 422 };
  }
  if (raw.includes("RUNTIME_VALIDATOR_UNAVAILABLE")) {
    return { code: "RUNTIME_VALIDATOR_UNAVAILABLE", failureCode, retryable: true, status: 503 };
  }
  if (raw.includes("ADAPTED_HTML_MEDIA_INTEGRITY_INVALID")) {
    return { code: "ADAPTED_HTML_MEDIA_INTEGRITY_INVALID", failureCode, retryable: false, status: 422 };
  }
  if (raw.includes("ACTION_RATE_EXCEEDED")) {
    return { code: "ADAPTED_HTML_ACTION_RATE_EXCEEDED", failureCode, retryable: false, status: 422 };
  }
  if (
    raw.includes("GAME_MECHANICS_CHANGED") ||
    raw.includes("ACTION_CARDINALITY_INVALID")
  ) {
    return { code: "ADAPTED_HTML_MECHANICS_CHANGED", failureCode, retryable: false, status: 422 };
  }
  if (raw.includes("UNSAFE") || raw.includes("NETWORK_ACCESS_ATTEMPTED")) {
    return { code: "ADAPTED_HTML_UNSAFE", failureCode, retryable: false, status: 422 };
  }
  if (
    raw.includes("INVALID_MANIFEST") ||
    raw.includes("GAME_MANIFEST_INVALID") ||
    raw.includes("GAME_MANIFEST_MISMATCH") ||
    raw.includes("MISSING_SYNC_CONTRACT") ||
    raw.includes("ACTION_CONTRACT_INVALID") ||
    raw.includes("VALIDATION_PLAN_INVALID")
  ) {
    return { code: "ADAPTED_HTML_CONTRACT_INVALID", failureCode, retryable: false, status: 422 };
  }
  if (raw.includes("ADAPTED_HTML_VALIDATION_FAILED") || raw.includes("RUNTIME_")) {
    return { code: "ADAPTED_HTML_RUNTIME_INVALID", failureCode, retryable: false, status: 422 };
  }
  return { code: raw.slice(0, 120), failureCode, retryable: false, status: 422 };
}
