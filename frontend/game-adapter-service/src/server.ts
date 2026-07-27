import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { adaptGameHtml } from "./adapter.js";

const port = Number(process.env.PORT ?? 8088);
const requestLimit = 7 * 1024 * 1024;

export function createGameAdapterServer() {
  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/actuator/health") {
        return json(response, 200, { status: "UP" });
      }
      if (request.method !== "POST" || request.url !== "/internal/game-adaptations") {
        return json(response, 404, { code: "NOT_FOUND" });
      }
      if (!authorized(request)) {
        return json(response, 401, { code: "UNAUTHORIZED" });
      }
      const body = JSON.parse(await readBody(request)) as { html?: unknown };
      if (typeof body.html !== "string") {
        return json(response, 400, { code: "HTML_REQUIRED" });
      }
      const result = await adaptGameHtml(body.html);
      return json(response, 200, result);
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 120) : "ADAPTATION_FAILED";
      return json(response, code === "REQUEST_TOO_LARGE" ? 413 : 422, { code });
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

async function readBody(request: IncomingMessage): Promise<string> {
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
  createGameAdapterServer().listen(port, "0.0.0.0");
}
