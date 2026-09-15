import { describe, expect, it } from "vitest";
import {
  MEDIA_PLACEHOLDER_PREFIX,
  MediaProtectionError,
  protectMediaForAi,
  restoreMediaAfterAi,
} from "./media-protector.js";

const payload = (bytes: number, character = "A") => character.repeat(Math.ceil(bytes / 4) * 4);
const image = (encoded = payload(300 * 1024)) => `data:image/webp;base64,${encoded}`;
const audio = (encoded = payload(32 * 1024, "B")) => `data:audio/mpeg;base64,${encoded}`;
const tokenFactory = (index: number) => `${MEDIA_PLACEHOLDER_PREFIX}${index}:test-token-${index}`;

describe("AI media protection", () => {
  it("leaves below-threshold media unchanged without a manifest", () => {
    const html = `<html><img src="${image(payload(1024))}"></html>`;
    const protectedMedia = protectMediaForAi(html, { tokenFactory });

    expect(protectedMedia).toMatchObject({ html, manifest: [], summary: { status: "not_needed" } });
  });

  it("extracts every supported image and audio resource after a threshold is reached", () => {
    const imageUri = image();
    const audioUri = audio();
    const html = `<html><style>.card{background:url('${imageUri}')}</style><script>const sound="${audioUri}";</script></html>`;
    const protectedMedia = protectMediaForAi(html, { tokenFactory });

    expect(protectedMedia.summary).toMatchObject({ resourceCount: 2, status: "protected" });
    expect(protectedMedia.html).not.toContain(imageUri);
    expect(protectedMedia.html).not.toContain(audioUri);
    expect(restoreMediaAfterAi(protectedMedia.html, protectedMedia)).toBe(html);
  });

  it("rejects reserved namespace collisions", () => {
    expect(() => protectMediaForAi(`<html>${MEDIA_PLACEHOLDER_PREFIX}0:source</html>`))
      .toThrow("reserved placeholder namespace");
  });

  it("skips dynamic and unsupported resources", () => {
    const dynamic = image() + "${suffix}";
    const video = `data:video/mp4;base64,${payload(300 * 1024)}`;
    const html = `<html><script>const image=\`${dynamic}\`;const video="${video}";</script></html>`;

    expect(protectMediaForAi(html, { tokenFactory })).toMatchObject({
      html,
      manifest: [],
      summary: { status: "not_needed" },
    });
  });

  it("rejects malformed selected base64 and configured resource bounds", () => {
    const malformed = image("A".repeat(300 * 1024 - 1));
    expect(() => protectMediaForAi(`<html>${malformed}</html>`, { tokenFactory }))
      .toThrow("base64 is invalid");

    const twoImages = `<html><img src="${image()}"><img src="${image()}"></html>`;
    expect(() => protectMediaForAi(twoImages, { maxResources: 1, tokenFactory }))
      .toThrow("bounds exceeded");
    expect(() => protectMediaForAi(twoImages, { maxExtractedBytes: 1024, tokenFactory }))
      .toThrow("bounds exceeded");
  });

  it("fails closed for missing duplicated altered and injected placeholders", () => {
    const protectedMedia = protectMediaForAi(`<html>${image()}</html>`, { tokenFactory });
    const token = protectedMedia.manifest[0]?.token ?? "";
    const candidates = [
      protectedMedia.html.replace(token, ""),
      protectedMedia.html.replace(token, token + token),
      protectedMedia.html.replace(token, `${token}-altered`),
      protectedMedia.html.replace("</html>", `${MEDIA_PLACEHOLDER_PREFIX}99:injected</html>`),
    ];

    for (const candidate of candidates) {
      expect(() => restoreMediaAfterAi(candidate, protectedMedia)).toThrow(MediaProtectionError);
    }
  });
});
