// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTokens, readTokens, storeTokens, skipSilentLoginOnce, rejectAccessToken } from "../shared/api/auth";
import { useAppController } from "./useAppController";

vi.mock("./controller/useLessonRealtime", () => ({ useLessonRealtime: () => ({}) }));
vi.mock("../features/courses", () => ({ useCourseWorkspaceData: () => ({ courses: [], courseLessons: {}, courseTopics: {}, courseLoading: false, courseMessage: null }) }));
vi.mock("../features/payments", () => ({ usePaymentInvoicesData: () => ({ paymentInvoices: [], paymentLoading: false, paymentMessage: null }) }));

const identity = { subject: "teacher-fixture", roles: ["TEACHER"], locale: "en", connectionRoutePreference: "AUTO" };
function installApi(materialsFail = false, profileFail = false) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === "/api/me") return json(identity);
    if (path === "/api/users/me/profile") return profileFail ? json({}, 503) : json(identity);
    if (path === "/api/materials") return materialsFail ? json({}, 503) : json([]);
    if (path.endsWith("/room-token")) return json({ token: "media-fixture", roomName: "fixture", serverUrl: "wss://fixture.example" });
    if (path === "/api/schedule/lessons/fixture") return json({ id: "fixture", status: "IN_PROGRESS", participants: [], teacherSubject: identity.subject });
    return json([]);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status }); }

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); clearTokens(); history.replaceState({}, "", "/"); storeTokens({ accessToken: "valid", expiresAt: Date.now() + 300_000 }); });
afterEach(() => { cleanup(); clearTokens(); vi.unstubAllGlobals(); });

describe("session recovery through the app controller", () => {
  it("preserves login when a workspace module fails and provides its retry message", async () => {
    installApi(true);
    const view = renderHook(() => useAppController());
    await waitFor(() => expect(view.result.current.status).toBe("authenticated"));
    await waitFor(() => expect(view.result.current.materialMessage).toBeTruthy());
    expect(view.result.current.profile?.subject).toBe(identity.subject);
    expect(readTokens()?.accessToken).toBe("valid");
    expect(view.result.current.isAuthenticated).toBe(true);
  });
  it("blocks dependent actions but retains credentials when required profile is unavailable", async () => {
    installApi(false, true);
    const view = renderHook(() => useAppController());
    await waitFor(() => expect(view.result.current.status).toBe("error"));
    expect(view.result.current.isAuthenticated).toBe(false);
    expect(view.result.current.recoveryPhase).toBe("unavailable");
    expect(readTokens()?.accessToken).toBe("valid");
    installApi();
    act(() => view.result.current.retrySessionRecovery?.());
    await waitFor(() => expect(view.result.current.status).toBe("authenticated"));
    expect(view.result.current.profile?.subject).toBe(identity.subject);
  });
  it("retains the classroom URL while required schedule data is unavailable", async () => {
    history.replaceState({}, "", "/lessons/fixture/classroom");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/me" || path === "/api/users/me/profile") return json(identity);
      if (path === "/api/schedule/lessons") return json({}, 503);
      return json([]);
    }));
    const view = renderHook(() => useAppController());
    await waitFor(() => expect(view.result.current.scheduleMessage).toBeTruthy());
    expect(window.location.pathname).toBe("/lessons/fixture/classroom");
    expect(view.result.current.status).toBe("authenticated");
  });
  it("coalesces foreground renewal and retains the authenticated UI after transient failure", async () => {
    installApi(); const view = renderHook(() => useAppController());
    await waitFor(() => expect(view.result.current.status).toBe("authenticated"));
    const fetch = vi.fn().mockResolvedValue(json({}, 429));
    // A long Retry-After gives a deterministic bounded exit without sleeping.
    fetch.mockImplementation(async () => new Response("", { status: 429, headers: { "Retry-After": "60" } }));
    vi.stubGlobal("fetch", fetch);
    act(() => { storeTokens({ accessToken: "expired", refreshToken: "fixture", expiresAt: 0 }); window.dispatchEvent(new Event("pageshow")); document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(view.result.current.recoveryPhase).toBe("unavailable"));
    expect(fetch).toHaveBeenCalledOnce(); expect(view.result.current.status).toBe("authenticated");
    expect(view.result.current.profile?.subject).toBe(identity.subject);
  });
  it("retains an active room on terminal rejection until explicit continuation", async () => {
    installApi(); const view = renderHook(() => useAppController());
    await waitFor(() => expect(view.result.current.status).toBe("authenticated"));
    await act(async () => { await view.result.current.joinScheduledLesson({ id: "fixture" } as never); await view.result.current.confirmScheduledLessonJoin({ id: "fixture" } as never, {} as never); });
    expect(view.result.current.roomMessage).not.toContain("Invalid");
    expect(view.result.current.roomSession?.lessonId, view.result.current.roomMessage ?? "no message").toBe("fixture");
    act(() => { rejectAccessToken("valid"); });
    expect(view.result.current.roomSession?.lessonId).toBe("fixture");
    expect(view.result.current.isAuthenticated).toBe(false);
    expect(view.result.current.recoveryPhase).toBe("signInRequired");
  });
  it("does not start a parallel silent login when explicit continuation releases the room", async () => {
    installApi(); const view = renderHook(() => useAppController());
    await waitFor(() => expect(view.result.current.status).toBe("authenticated"));
    await act(async () => { await view.result.current.joinScheduledLesson({ id: "fixture" } as never); await view.result.current.confirmScheduledLessonJoin({ id: "fixture" } as never, {} as never); });
    act(() => rejectAccessToken("valid"));
    const original = Object.getOwnPropertyDescriptor(window.crypto, "subtle");
    const completions: Array<(value: ArrayBuffer) => void> = [];
    const digest = vi.fn(() => new Promise<ArrayBuffer>((resolve) => { completions.push(resolve); }));
    Object.defineProperty(window.crypto, "subtle", { configurable: true, value: { digest } });
    let continuation: Promise<void> | undefined;
    try {
      expect(view.result.current.continueSessionLogin).toBeTypeOf("function");
      act(() => { continuation = view.result.current.continueSessionLogin?.(); });
      await act(async () => { await Promise.resolve(); });
      expect(digest).toHaveBeenCalledTimes(1);
      expect(view.result.current.recoveryPhase).toBe("recovering");
      expect(view.result.current.roomSession).toBeNull();
    } finally {
      completions.forEach((resolve) => resolve(new ArrayBuffer(32)));
      await act(async () => { await continuation; });
      if (original) Object.defineProperty(window.crypto, "subtle", original);
      else Reflect.deleteProperty(window.crypto, "subtle");
    }
  });
  it("does not restore the old account when logout happens during bootstrap", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const view = renderHook(() => useAppController());
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    act(() => { clearTokens(); skipSilentLoginOnce(); });
    await act(async () => { finish(json(identity)); });
    expect(view.result.current.profile).toBeNull(); expect(readTokens()).toBeNull();
  });
});
