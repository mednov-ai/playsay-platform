import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AppUserProfile, MeProfile } from "../../../shared/api/playsay";
import { ProfileAccountPanel } from "./ProfileAccountPanel";

describe("ProfileAccountPanel", () => {
  it("renders country selection for the app profile", () => {
    const markup = renderToStaticMarkup(createElement(ProfileAccountPanel, {
      adminLoading: false,
      adminMessage: null,
      adminUsers: [],
      appProfile: {
        subject: "teacher-1",
        username: "teacher.one",
        email: "teacher@example.com",
        name: "Teacher One",
        roles: ["TEACHER"],
        displayName: "Teacher One",
        locale: "ru",
        countryCode: "RU",
        timezone: "Europe/Moscow",
        learningGoal: null,
        updatedAt: "2026-06-03T00:00:00.000Z",
      } as AppUserProfile,
      error: null,
      isAdmin: false,
      isAuthenticated: true,
      onRefreshAdminUsers: vi.fn(),
      onResetProfile: vi.fn(),
      onSaveProfile: vi.fn(),
      profile: {
        email: "teacher@example.com",
        name: "Teacher One",
        roles: ["TEACHER"],
        subject: "teacher-1",
        username: "teacher.one",
      } as MeProfile,
      profileMessage: null,
      profileSaving: false,
      status: "authenticated",
    }));

    expect(markup).toContain("Страна");
    expect(markup).toContain("Россия");
  });
});
