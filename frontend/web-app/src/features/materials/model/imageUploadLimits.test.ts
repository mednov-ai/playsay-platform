// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareMaterialDraftSourceImage } from "./documentFactory";

vi.mock("../../../shared/i18n", () => ({
  i18n: { t: (key: string) => key === "materials.errors.imageSize" ? "Image exceeds 20 MiB." : key },
}));

describe("photo-based material draft limits", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prepares a source image at twenty MiB and rejects one byte more", async () => {
    class FakeImage {
      naturalWidth = 100;
      naturalHeight = 50;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: "",
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AA==");
    const atLimit = new File(["image"], "at-limit.jpg", { type: "image/jpeg" });
    const tooLarge = new File(["image"], "too-large.jpg", { type: "image/jpeg" });
    Object.defineProperty(atLimit, "size", { value: 20 * 1024 * 1024 });
    Object.defineProperty(tooLarge, "size", { value: 20 * 1024 * 1024 + 1 });

    const result = await prepareMaterialDraftSourceImage(atLimit);
    expect(result.originalSize).toBe(20 * 1024 * 1024);
    expect(result.dataUrl).toBe("data:image/jpeg;base64,AA==");
    await expect(prepareMaterialDraftSourceImage(tooLarge)).rejects.toThrow(/20/);
  });
});
