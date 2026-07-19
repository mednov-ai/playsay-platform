import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { workspaceTabsForProfile } from "../entities/workspace/model";
import { AppProviders } from "./AppProviders";
import { AppShell, type AppShellProps } from "./AppShell";

const teacherProfile = {
  subject: "teacher-demo",
  username: "teacher-demo",
  email: "teacher@example.test",
  name: "Teacher Demo",
  roles: ["TEACHER"],
};

describe("AppShell", () => {
  it("points teachers to lesson creation when no live lesson is joinable", () => {
    const props = appShellProps();
    const markup = renderToStaticMarkup(createElement(
      AppProviders,
      null,
      createElement(AppShell, props),
    ));

    expect(markup).toContain("Назначить урок");
    expect(markup).not.toContain("Войти в урок");
    expect(markup).toContain('data-playsay-tools-layout="true"');
  });

  it("renders profile as a dedicated route instead of stacking it above the workspace", () => {
    const props = appShellProps();
    props.isProfileRoute = true;
    const markup = renderToStaticMarkup(createElement(
      AppProviders,
      null,
      createElement(AppShell, props),
    ));

    expect(markup).toContain('href="/profile"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain('aria-label="Рабочие разделы"');
  });
});

function appShellProps(): AppShellProps {
  return {
    adminLoading: false,
    adminMessage: null,
    adminUsers: [],
    anyLessonLoading: false,
    appProfile: {
      ...teacherProfile,
      displayName: "Teacher Demo",
      locale: "ru",
      countryCode: "RU",
      timezone: "Europe/Moscow",
      learningGoal: null,
      lessonTranslationAllowed: false,
      managedByTeacher: false,
      updatedAt: "2026-06-27T09:00:00.000Z",
    },
    assignMaterialToScheduledLesson: vi.fn(),
    cancelScheduledLesson: vi.fn(),
    classroomLesson: null,
    completeScheduledLesson: vi.fn(),
    confirmScheduledLessonJoin: vi.fn(),
    copyScheduledLessonLinks: vi.fn(),
    courseLessons: {},
    courseLoading: false,
    courseMessage: null,
    courseTopics: {},
    courses: [],
    createCourse: vi.fn(),
    createLesson: vi.fn(),
    createPaymentInvoice: vi.fn(),
    createManagedStudent: vi.fn(),
    createScheduledLesson: vi.fn(),
    createTopic: vi.fn(),
    deleteCourse: vi.fn(),
    deleteLesson: vi.fn(),
    deleteMaterial: vi.fn(),
    deleteScheduledLesson: vi.fn(),
    deleteTopic: vi.fn(),
    error: null,
    generateImagesForMaterial: vi.fn(),
    generateMaterialDraft: vi.fn(),
    generateMaterialDraftFromUrl: vi.fn(),
    isAdmin: false,
    isAuthenticated: true,
    isClassroomOpen: false,
    isProfileRoute: false,
    joinScheduledLesson: vi.fn(),
    leaveScheduledLessonRoom: vi.fn(),
    linkMaterialToCourseLesson: vi.fn(),
    logout: vi.fn(),
    materialLoading: false,
    materialMessage: null,
    materials: [],
    nextJoinableLesson: null,
    nextLessonLoading: false,
    nowMs: Date.parse("2026-06-27T09:00:00.000Z"),
    paymentInvoices: [],
    paymentLoading: false,
    paymentMessage: null,
    profile: teacherProfile,
    profileMessage: null,
    profileSaving: false,
    refreshAdminUsers: vi.fn(),
    refreshCourses: vi.fn(),
    refreshMaterials: vi.fn(),
    refreshPaymentInvoices: vi.fn(),
    refreshSchedule: vi.fn(),
    replaceLessonCards: vi.fn(),
    resetProfile: vi.fn(),
    roomLoadingLessonId: null,
    roomMessage: null,
    roomSession: null,
    saveProfile: vi.fn(),
    scheduleLoading: false,
    scheduleMessage: null,
    scheduledLessons: [],
    setWorkspaceTab: vi.fn(),
    status: "authenticated",
    studentUsers: [],
    suggestAcceptedAnswersForMaterial: vi.fn(),
    updateMaterialAssetMetadata: vi.fn(),
    updateTopic: vi.fn(),
    upsertMaterial: vi.fn(),
    workspaceTab: "schedule",
    workspaceTabs: workspaceTabsForProfile(teacherProfile),
    openProfile: vi.fn(),
    closeProfile: vi.fn(),
  };
}
