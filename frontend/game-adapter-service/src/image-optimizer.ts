import sharp, { type Metadata } from "sharp";

export const IMAGE_OPTIMIZATION_POLICY = "embedded-raster-v1";
export const INDIVIDUAL_TRIGGER_BYTES = 256 * 1024;
export const AGGREGATE_TRIGGER_BYTES = 1024 * 1024;
export const MAX_ELIGIBLE_IMAGES = 64;
export const MAX_PIXELS_PER_IMAGE = 16_000_000;
export const MAX_TOTAL_PIXELS = 64_000_000;
export const MAX_DECODED_RGBA_BYTES = 256 * 1024 * 1024;
const MINIMUM_SAVINGS_RATIO = 0.15;

type SupportedFormat = "png" | "jpeg" | "webp";

export type ImageOptimizationStatus = "NOT_NEEDED" | "UNCHANGED" | "OPTIMIZED";

export interface ImageOptimizationResult {
  html: string;
  policy: typeof IMAGE_OPTIMIZATION_POLICY;
  status: ImageOptimizationStatus;
  inputBytes: number;
  outputBytes: number;
  eligibleCount: number;
  replacedCount: number;
  bytesSaved: number;
  durationMs: number;
}

interface EmbeddedRasterSpan {
  start: number;
  end: number;
  format: SupportedFormat;
  prefix: string;
  payload: string;
  source: string;
}

export class ImageOptimizationError extends Error {
  constructor(public readonly code: "IMAGE_INVALID" | "IMAGE_LIMIT_EXCEEDED") {
    super(code);
  }
}

const dataUriPattern = /data:image\/(png|jpe?g|webp);base64,([^"'`\s)<>,;]+)/giu;

export function scanEmbeddedRasterSpans(html: string): EmbeddedRasterSpan[] {
  const spans: EmbeddedRasterSpan[] = [];
  for (const match of html.matchAll(dataUriPattern)) {
    const start = match.index;
    if (start === undefined) continue;
    const source = match[0];
    const end = start + source.length;
    // A quoted fragment followed by concatenation is a dynamic URL, not a
    // contiguous self-contained resource. It must remain byte-identical.
    if (payloadIsDynamic(match[2]) || /^["'`]\s*\+/u.test(html.slice(end))) continue;
    const rawFormat = match[1].toLowerCase();
    const format: SupportedFormat = rawFormat === "jpg" ? "jpeg" : rawFormat as SupportedFormat;
    const payload = match[2];
    spans.push({
      start,
      end,
      format,
      prefix: source.slice(0, source.length - payload.length),
      payload,
      source,
    });
  }
  return spans;
}

function payloadIsDynamic(payload: string): boolean {
  return payload.includes("${") || payload.includes("\\");
}

export function requiresEmbeddedImageOptimization(html: string): boolean {
  const spans = scanEmbeddedRasterSpans(html);
  const aggregateBytes = spans.reduce((sum, span) => sum + Buffer.byteLength(span.source), 0);
  return aggregateBytes >= AGGREGATE_TRIGGER_BYTES ||
    spans.some((span) => Buffer.byteLength(span.source) >= INDIVIDUAL_TRIGGER_BYTES);
}

export async function optimizeEmbeddedImages(
  html: string,
  policy: string = IMAGE_OPTIMIZATION_POLICY,
): Promise<ImageOptimizationResult> {
  const startedAt = performance.now();
  if (policy !== IMAGE_OPTIMIZATION_POLICY) throw new ImageOptimizationError("IMAGE_INVALID");
  const inputBytes = Buffer.byteLength(html);
  const spans = scanEmbeddedRasterSpans(html);
  if (!requiresEmbeddedImageOptimization(html)) {
    return result(html, "NOT_NEEDED", inputBytes, 0, 0, startedAt);
  }
  if (spans.length > MAX_ELIGIBLE_IMAGES) throw new ImageOptimizationError("IMAGE_LIMIT_EXCEEDED");

  let totalPixels = 0;
  let eligibleCount = 0;
  let replacedCount = 0;
  const replacements = new Map<number, string>();
  const eligible: Array<{ span: EmbeddedRasterSpan; input: Buffer; metadata: Metadata }> = [];

  for (const span of spans) {
    const input = strictBase64Decode(span.payload);
    let metadata: Metadata;
    try {
      metadata = await sharp(input, { animated: true, limitInputPixels: false }).metadata();
    } catch {
      throw new ImageOptimizationError("IMAGE_INVALID");
    }
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const pixels = width * height;
    if (metadata.format !== span.format || width <= 0 || height <= 0) {
      throw new ImageOptimizationError("IMAGE_INVALID");
    }
    if (pixels > MAX_PIXELS_PER_IMAGE) throw new ImageOptimizationError("IMAGE_LIMIT_EXCEEDED");
    if ((metadata.pages ?? 1) > 1) continue;
    totalPixels += pixels;
    if (totalPixels > MAX_TOTAL_PIXELS || totalPixels * 4 > MAX_DECODED_RGBA_BYTES) {
      throw new ImageOptimizationError("IMAGE_LIMIT_EXCEEDED");
    }
    eligibleCount += 1;
    eligible.push({ span, input, metadata });
  }

  for (const { span, input, metadata } of eligible) {
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const candidate = await encode(input, span.format);
    const verified = await sharp(candidate, { animated: true, limitInputPixels: MAX_PIXELS_PER_IMAGE }).metadata();
    if (
      verified.format !== span.format || verified.width !== width || verified.height !== height ||
      (verified.pages ?? 1) !== 1 || Boolean(verified.hasAlpha) !== Boolean(metadata.hasAlpha)
    ) {
      throw new ImageOptimizationError("IMAGE_INVALID");
    }
    const replacement = `${span.prefix}${candidate.toString("base64")}`;
    if (Buffer.byteLength(replacement) <= Buffer.byteLength(span.source) * (1 - MINIMUM_SAVINGS_RATIO)) {
      replacements.set(span.start, replacement);
      replacedCount += 1;
    }
  }

  let cursor = 0;
  let optimized = "";
  for (const span of spans) {
    optimized += html.slice(cursor, span.start);
    optimized += replacements.get(span.start) ?? span.source;
    cursor = span.end;
  }
  optimized += html.slice(cursor);
  if (Buffer.byteLength(optimized) > inputBytes) throw new ImageOptimizationError("IMAGE_INVALID");
  return result(optimized, replacedCount > 0 ? "OPTIMIZED" : "UNCHANGED", inputBytes, eligibleCount, replacedCount, startedAt);
}

function strictBase64Decode(payload: string): Buffer {
  if (payload.length === 0 || payload.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(payload)) {
    throw new ImageOptimizationError("IMAGE_INVALID");
  }
  const decoded = Buffer.from(payload, "base64");
  if (decoded.toString("base64") !== payload) throw new ImageOptimizationError("IMAGE_INVALID");
  return decoded;
}

async function encode(input: Buffer, format: SupportedFormat): Promise<Buffer> {
  const pipeline = sharp(input, { animated: false, limitInputPixels: MAX_PIXELS_PER_IMAGE });
  try {
    switch (format) {
      case "webp": return await pipeline.webp({ quality: 85, alphaQuality: 100, effort: 4 }).toBuffer();
      case "jpeg": return await pipeline.jpeg({ quality: 85, progressive: true, mozjpeg: true }).toBuffer();
      case "png": return await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
    }
  } catch {
    throw new ImageOptimizationError("IMAGE_INVALID");
  }
}

function result(
  html: string,
  status: ImageOptimizationStatus,
  inputBytes: number,
  eligibleCount: number,
  replacedCount: number,
  startedAt: number,
): ImageOptimizationResult {
  const outputBytes = Buffer.byteLength(html);
  return {
    html,
    policy: IMAGE_OPTIMIZATION_POLICY,
    status,
    inputBytes,
    outputBytes,
    eligibleCount,
    replacedCount,
    bytesSaved: inputBytes - outputBytes,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
  };
}
