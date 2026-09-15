import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  IMAGE_OPTIMIZATION_POLICY,
  optimizeEmbeddedImages,
  requiresEmbeddedImageOptimization,
  scanEmbeddedRasterSpans,
} from "./image-optimizer.js";

const width = 640;
const height = 640;

function pixels(): Buffer {
  const buffer = Buffer.alloc(width * height * 4);
  let value = 0x12345678;
  for (let index = 0; index < buffer.length; index += 4) {
    value = (value * 1664525 + 1013904223) >>> 0;
    buffer[index] = (index / 4) % width;
    buffer[index + 1] = Math.floor(index / 4 / width) % 256;
    buffer[index + 2] = value & 0xff;
    buffer[index + 3] = index % 20 === 0 ? 160 : 255;
  }
  return buffer;
}

async function fixture(format: "png" | "jpeg" | "webp"): Promise<string> {
  const image = sharp(pixels(), { raw: { width, height, channels: 4 } });
  const encoded = format === "png"
    ? await image.png({ compressionLevel: 0 }).toBuffer()
    : format === "jpeg"
      ? await image.removeAlpha().jpeg({ quality: 100 }).toBuffer()
      : await image.webp({ lossless: true }).toBuffer();
  return `data:image/${format};base64,${encoded.toString("base64")}`;
}

describe("embedded raster scanner", () => {
  it("finds markup, CSS and JavaScript spans without executing content", async () => {
    const png = await fixture("png");
    const jpeg = await fixture("jpeg");
    const webp = await fixture("webp");
    const html = `<html><img src="${png}"><style>.card{background:url('${jpeg}')}</style><script>const donut="${webp}";</script></html>`;

    const spans = scanEmbeddedRasterSpans(html);

    expect(spans.map(({ format }) => format)).toEqual(["png", "jpeg", "webp"]);
    expect(requiresEmbeddedImageOptimization(html)).toBe(true);
    for (const span of spans) expect(html.slice(span.start, span.end)).toBe(span.source);
  });

  it("leaves unsupported and dynamically concatenated resources alone", () => {
    const html = `<html><img src="data:image/svg+xml;base64,AAAA"><script>const x="data:image/png;base64,QUJD" + suffix; const y=\`data:image/webp;base64,AAAA\${suffix}\`;</script></html>`;
    expect(scanEmbeddedRasterSpans(html)).toEqual([]);
    expect(requiresEmbeddedImageOptimization(html)).toBe(false);
  });

  it("enforces the candidate-count bound before decoding", async () => {
    const payload = "A".repeat(16_384);
    const html = `<html>${Array.from({ length: 65 }, () => `<img src="data:image/png;base64,${payload}">`).join("")}</html>`;
    await expect(optimizeEmbeddedImages(html)).rejects.toEqual(expect.objectContaining({
      code: "IMAGE_LIMIT_EXCEEDED",
    }));
  });

  it("rejects malformed selected base64", async () => {
    const malformed = `${"A".repeat(300_000)}!bad`;
    const html = `<html><img src="data:image/png;base64,${malformed}"></html>`;
    await expect(optimizeEmbeddedImages(html)).rejects.toEqual(expect.objectContaining({
      code: "IMAGE_INVALID",
    }));
  });

  it("rejects an image above the 16 megapixel bound before pixel decoding", async () => {
    const headerSized = await sharp({
      create: { width: 4_001, height: 4_000, channels: 3, background: "#f0c040" },
    }).png({ compressionLevel: 9 }).toBuffer();
    const padded = Buffer.concat([headerSized, Buffer.alloc(300_000)]).toString("base64");
    const html = `<html><img src="data:image/png;base64,${padded}"></html>`;

    await expect(optimizeEmbeddedImages(html)).rejects.toEqual(expect.objectContaining({
      code: "IMAGE_LIMIT_EXCEEDED",
    }));
  });

  it("enforces the 64 megapixel aggregate bound before encoding candidates", async () => {
    const image = await sharp({
      create: { width: 4_000, height: 3_000, channels: 3, background: "#ffe080" },
    }).png({ compressionLevel: 9 }).toBuffer();
    const padded = Buffer.concat([image, Buffer.alloc(Math.max(0, 190_000 - image.length))]).toString("base64");
    const html = `<html>${Array.from({ length: 6 }, () => `<img src="data:image/png;base64,${padded}">`).join("")}</html>`;

    await expect(optimizeEmbeddedImages(html)).rejects.toEqual(expect.objectContaining({
      code: "IMAGE_LIMIT_EXCEEDED",
    }));
  });

  it("leaves animated WebP byte-identical while processing remains bounded", async () => {
    const twoFrameGif = Buffer.from(
      "47494638396101000100800000000000ffffff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b",
      "hex",
    );
    const animatedWebp = await sharp(twoFrameGif, { animated: true }).webp().toBuffer();
    const padded = Buffer.concat([animatedWebp, Buffer.alloc(300_000)]).toString("base64");
    const html = `<html><script>const animation="data:image/webp;base64,${padded}";</script></html>`;

    const optimized = await optimizeEmbeddedImages(html);

    expect(optimized).toMatchObject({ html, status: "UNCHANGED", eligibleCount: 0, replacedCount: 0 });
  });
});

describe(IMAGE_OPTIMIZATION_POLICY, () => {
  it("re-encodes Donut-shaped markup, CSS and JavaScript fixtures deterministically", async () => {
    const png = await fixture("png");
    const jpeg = await fixture("jpeg");
    const webp = await fixture("webp");
    const stablePrefix = `<html><body data-stable="unchanged"><img src="${png}"><style>.donut{background-image:url(${jpeg})}</style><script>const donutSprite='${webp}';window.marker='unchanged';</script></body></html>`;

    const first = await optimizeEmbeddedImages(stablePrefix);
    const second = await optimizeEmbeddedImages(stablePrefix);

    expect(first.status).toBe("OPTIMIZED");
    expect(first.eligibleCount).toBe(3);
    expect(first.replacedCount).toBeGreaterThanOrEqual(2);
    expect(first.outputBytes).toBeLessThan(first.inputBytes);
    expect(first.bytesSaved).toBe(first.inputBytes - first.outputBytes);
    expect(second.html).toBe(first.html);
    expect(first.html).toContain(`data-stable="unchanged"`);
    expect(first.html).toContain(`window.marker='unchanged'`);

    for (const span of scanEmbeddedRasterSpans(first.html)) {
      const decoded = Buffer.from(span.payload, "base64");
      const metadata = await sharp(decoded).metadata();
      expect(metadata.width).toBe(width);
      expect(metadata.height).toBe(height);
      expect(metadata.format).toBe(span.format);
    }
  });

  it("returns the exact source when thresholds are not met", async () => {
    const html = `<html><img src="data:image/png;base64,iVBORw0KGgo="><p>same</p></html>`;
    const result = await optimizeEmbeddedImages(html);
    expect(result).toMatchObject({
      html,
      status: "NOT_NEEDED",
      inputBytes: Buffer.byteLength(html),
      outputBytes: Buffer.byteLength(html),
      replacedCount: 0,
      bytesSaved: 0,
    });
  });
});
