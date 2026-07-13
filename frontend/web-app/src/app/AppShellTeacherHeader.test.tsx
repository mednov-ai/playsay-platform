import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppShellProps } from "./AppShell";
import { AppShell } from "./AppShell";
import { AppProviders } from "./AppProviders";
import { LessonPreparationPanel } from "../features/schedule/ui/LessonPreparationPanel";

describe("AppShell teacher header", () => {
  it("shows create lesson instead of a disabled join CTA when no lesson is joinable", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <AppShell {...props()} />
      </AppProviders>,
    );

    expect(markup).not.toContain("Войти в урок");
    expect(markup).toContain("Назначить урок");
  });

  it("opens the dedicated preparation workspace for a scheduled lesson", () => {
    const lesson = {
      createdAt: "2026-05-20T10:00:00.000Z",
      id: "lesson-prepare",
      lessonTitle: "Speaking warm-up",
      participants: [{ subject: "student-1", displayName: "Mila" }],
      scheduledEnd: "2026-05-28T10:45:00.000Z",
      scheduledStart: "2026-05-28T10:00:00.000Z",
      status: "SCHEDULED",
      type: "INDIVIDUAL",
      updatedAt: "2026-05-20T10:00:00.000Z",
      workMode: "SHARED",
    } as AppShellProps["scheduledLessons"][number];
    const markup = renderToStaticMarkup(
      <AppProviders>
        <LessonPreparationPanel
          disabled={false}
          lesson={lesson}
          materials={[]}
          message={null}
          onAssignMaterial={async () => null}
          onBack={() => undefined}
          onCopyLinks={async () => true}
          onOpenMaterials={() => undefined}
          onStart={async () => undefined}
        />
      </AppProviders>,
    );

    expect(markup).toContain("Подготовка урока");
    expect(markup).toContain("Начать урок");
    expect(markup).toContain("Mila");
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
    isProfileRoute: false,
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
    openProfile: () => undefined,
    closeProfile: () => undefined,
  };
}
