import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppShellProps } from "./AppShell";
import { AppShell } from "./AppShell";
import { AppProviders } from "./AppProviders";

describe("AppShell teacher header", () => {
  it("shows create lesson instead of a disabled join CTA when no lesson is joinable", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <AppShell {...props()} />
      </AppProviders>,
    );

    expect(markup).not.toContain("Войти в урок");
    expect(markup).toContain("Создать урок");
  });
});

function props(): AppShellProps {
  return {
    adminLoading: false,
    adminMessage: null,
    adminUsers: [],
    anyLessonLoading: false,
    appProfile: null,
    assignMaterialToScheduledLesson: async () => null,
    cancelScheduledLesson: async () => undefined,
    completeScheduledLesson: async () => undefined,
    copyScheduledLessonLinks: async () => true,
    courseLessons: {},
    courseLoading: false,
    courseMessage: null,
    courseTopics: {},
    courses: [],
    createCourse: async () => undefined,
    createLesson: async () => undefined,
    createManagedStudent: async () => null,
    createTopic: async () => undefined,
    createScheduledLesson: async () => undefined,
    deleteCourse: async () => undefined,
    deleteLesson: async () => undefined,
    deleteMaterial: async () => undefined,
    deleteTopic: async () => undefined,
    deleteScheduledLesson: async () => undefined,
    error: null,
    generateImagesForMaterial: async () => null,
    generateMaterialDraft: async () => null,
    generateMaterialDraftFromUrl: async () => null,
    isAdmin: false,
    isAuthenticated: true,
    isClassroomOpen: false,
    joinScheduledLesson: async () => undefined,
    leaveScheduledLessonRoom: () => undefined,
    linkMaterialToCourseLesson: async () => undefined,
    logout: () => undefined,
    materialLoading: false,
    materialMessage: null,
    materials: [],
    nextJoinableLesson: null,
    nextLessonLoading: false,
    nowMs: Date.parse("2026-05-28T10:00:00.000Z"),
    paymentInvoices: [],
    paymentLoading: false,
    paymentMessage: null,
    profile: {
      roles: ["TEACHER"],
      subject: "teacher-demo",
      username: "teacher-demo",
    } as AppShellProps["profile"],
    profileMessage: null,
    profileOpen: false,
    profileSaving: false,
    refreshAdminUsers: async () => undefined,
    refreshCourses: async () => undefined,
    refreshMaterials: async () => undefined,
    refreshPaymentInvoices: async () => undefined,
    refreshSchedule: async () => undefined,
    resetProfile: async () => undefined,
    roomLoadingLessonId: null,
    roomMessage: null,
    roomSession: null,
    saveProfile: async () => undefined,
    scheduleLoading: false,
    scheduleMessage: null,
    scheduledLessons: [],
    setProfileOpen: () => undefined,
    setWorkspaceTab: () => undefined,
    status: "authenticated",
    studentUsers: [],
    replaceLessonCards: async () => undefined,
    createPaymentInvoice: async () => null,
    suggestAcceptedAnswersForMaterial: async () => null,
    updateMaterialAssetMetadata: async () => null,
    updateTopic: async () => undefined,
    upsertMaterial: async () => null,
    workspaceTab: "schedule",
    workspaceTabs: [],
  };
}
