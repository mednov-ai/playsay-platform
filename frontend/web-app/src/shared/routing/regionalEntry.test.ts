import { describe, expect, it } from "vitest";
import { regionalEntryUrl } from "./regionalEntry";

describe("regionalEntryUrl", () => {
  it("preserves a production lesson path, query and fragment", () => {
    expect(regionalEntryUrl({
      hash: "#step",
      hostname: "online.honey.school",
      pathname: "/lessons/lesson-1/classroom",
      protocol: "https:",
      search: "?source=invite",
    })).toBe("https://online.honeyschool.ru/lessons/lesson-1/classroom?source=invite#step");
  });

  it("never moves an OIDC callback to another origin", () => {
    expect(regionalEntryUrl({
      hash: "", hostname: "online.honey.school", pathname: "/auth/callback",
      protocol: "https:", search: "?code=secret&state=transaction",
    })).toBeNull();
  });

  it("keeps development inside the development environment", () => {
    expect(regionalEntryUrl({
      hash: "",
      hostname: "dev.online.honey.school",
      pathname: "/",
      protocol: "https:",
      search: "",
    })).toBe("https://dev.online.honeyschool.ru/");
  });

  it("does not redirect an RF origin back or invent a route for another host", () => {
    expect(regionalEntryUrl({
      hash: "",
      hostname: "online.honeyschool.ru",
      pathname: "/",
      protocol: "https:",
      search: "",
    })).toBeNull();
  });
});
