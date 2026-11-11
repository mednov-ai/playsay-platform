// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTokens, storeTokens } from "./auth";
import { fetchMaterialAssetObjectUrl, fetchMaterialAssetText, fetchParallelStudentLegacyAnnotations, fetchUnallocatedParallelMaterialAnnotations } from "./materials";

describe("private material asset requests", () => {
  afterEach(() => {
    clearTokens();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the new resource identity and bypasses the browser cache for both readers", async () => {
    storeTokens({ accessToken: "teacher-token", expiresAt: Date.now() + 300_000 });
    const fetchMock = vi.fn().mockImplementation(async () => new Response("synthetic asset"));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic");

    await expect(fetchMaterialAssetObjectUrl("material", "display")).resolves.toBe("blob:synthetic");
    storeTokens({ accessToken: "student-token", expiresAt: Date.now() + 300_000 });
    await expect(fetchMaterialAssetText("material", "display")).resolves.toBe("synthetic asset");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [index, token] of ["teacher-token", "student-token"].entries()) {
      const [url, options] = fetchMock.mock.calls[index] as [string, RequestInit];
      expect(url).toBe("/api/materials/material/assets/display/content?access=private-v1");
      expect(options.cache).toBe("no-store");
      expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${token}`);
    }
  });

  it("discards an archive body when credentials change during JSON decoding", async () => {
    storeTokens({ accessToken: "teacher-token", expiresAt: Date.now() + 300_000 });
    let resolveJson!: (result: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, json: () => new Promise((resolve) => { resolveJson = resolve; }) })));
    const pending = fetchUnallocatedParallelMaterialAnnotations("lesson", "material").catch((error: unknown) => error);
    await vi.waitFor(() => expect(resolveJson).toBeDefined());
    storeTokens({ accessToken: "student-token", expiresAt: Date.now() + 300_000 });
    resolveJson({ content: { elements: [] } });
    expect(await pending).toMatchObject({ errorCode: "SESSION_CHANGED" });
  });

  it("reads the selected legacy layer without caching and rejects a response decoded after account change", async () => {
    storeTokens({ accessToken: "teacher-token", expiresAt: Date.now() + 300_000 });
    let resolveJson!: (result: unknown) => void;
    const fetchMock = vi.fn(async () => ({ status: 200, json: () => new Promise((resolve) => { resolveJson = resolve; }) }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = fetchParallelStudentLegacyAnnotations("lesson", "material", "student/a").catch((error: unknown) => error);
    await vi.waitFor(() => expect(resolveJson).toBeDefined());
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/schedule/lessons/lesson/materials/material/students/student%2Fa/parallel-annotations");
    expect(options.cache).toBe("no-store");
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer teacher-token");
    storeTokens({ accessToken: "another-token", expiresAt: Date.now() + 300_000 });
    resolveJson({ content: { elements: [] } });
    expect(await pending).toMatchObject({ errorCode: "SESSION_CHANGED" });
  });

  it("discards a previous user's response after credentials change", async () => {
    storeTokens({ accessToken: "teacher-token", expiresAt: Date.now() + 300_000 });
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })));
    const pending = fetchMaterialAssetText("material", "source").catch((error: unknown) => error);
    await vi.waitFor(() => expect(resolveFetch).toBeDefined());
    storeTokens({ accessToken: "student-token", expiresAt: Date.now() + 300_000 });
    resolveFetch(new Response("private synthetic source"));
    expect(await pending).toMatchObject({ errorCode: "SESSION_CHANGED" });
  });
});
