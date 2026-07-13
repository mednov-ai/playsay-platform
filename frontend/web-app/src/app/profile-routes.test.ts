import { describe, expect, it } from "vitest";
import {
  isProfilePath,
  profileHistoryState,
  profilePath,
  profileReturnPathFromHistoryState,
  subscribeToPathnameHistory,
} from "./routes";

describe("profile routes", () => {
  it("recognizes the canonical route with an optional trailing slash", () => {
    expect(profilePath()).toBe("/profile");
    expect(isProfilePath("/profile")).toBe(true);
    expect(isProfilePath("/profile/")).toBe(true);
    expect(isProfilePath("/profiles")).toBe(false);
    expect(isProfilePath("/")).toBe(false);
  });

  it("keeps a safe workspace return path in browser history state", () => {
    expect(profileReturnPathFromHistoryState(profileHistoryState("/"))).toBe("/");
    expect(profileReturnPathFromHistoryState(profileHistoryState("/lessons/lesson-1/prepare")))
      .toBe("/lessons/lesson-1/prepare");
    expect(profileReturnPathFromHistoryState({ playsayProfileReturnPath: "https://example.test" })).toBeNull();
    expect(profileReturnPathFromHistoryState(null)).toBeNull();
  });

  it("updates the active route for browser Back and Forward events", () => {
    const listeners = new Set<() => void>();
    const source = {
      location: { pathname: "/profile" },
      addEventListener: (_type: "popstate", listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: "popstate", listener: () => void) => listeners.delete(listener),
    };
    const visitedPathnames: string[] = [];
    const unsubscribe = subscribeToPathnameHistory(source, (pathname) => visitedPathnames.push(pathname));

    source.location.pathname = "/";
    listeners.forEach((listener) => listener());
    source.location.pathname = "/profile";
    listeners.forEach((listener) => listener());

    expect(visitedPathnames).toEqual(["/", "/profile"]);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
