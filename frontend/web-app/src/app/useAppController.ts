import { useEffect, useState } from "react";
import { workspaceTabsForProfile } from "../entities/workspace/model";
import { compareJoinableLessons, isArchivedScheduleLesson, isJoinableScheduledLesson } from "../entities/schedule/model";
import { rememberChatTargetFromLocation } from "../features/chat/model/chatDeepLink";
import {
  ApiError,
  buildLogoutUrl,
  clearTokens,
  completeLogin,
  consumeCompletedAuthAction,
  consumeSkipSilentLogin,
  fetchAdminUserProfiles,
  fetchAuthenticationMethods,
  fetchMaterials,
  fetchMe,
  fetchScheduledLessons,
  fetchStudentProfiles,
  fetchUserProfile,
  isSilentLoginUnavailable,
  isAuthCallback,
  readTokens,
  saveUserProfile,
  deleteAuthenticationPasskey,
  renameAuthenticationPasskey,
  skipSilentLoginOnce,
  startSilentLogin,
  type AdminUserProfile,
  type AuthenticationMethods,
  type AppUserProfile,
  type CompletedAuthAction,
  type LessonMaterial,
  type MeProfile,
  type ScheduledLesson,
  type UpdateUserProfileInput,
} from "../shared/api/playsay";
import {
  classroomLessonIdFromPath,
  isProfilePath,
  lessonPreparationIdFromPath,
  lessonPreparationPath,
  profileHistoryState,
  profilePath,
  profileReturnPathFromHistoryState,
  subscribeToPathnameHistory,
} from "./routes";
import type { SessionStatus } from "../features/profile/ui/ProfileAccountPanel";
import { useCourseWorkspaceData } from "../features/courses";
import { usePaymentInvoicesData } from "../features/payments";
import {
  type LessonRoomSession,
} from "../features/classroom";
import type { AppShellProps } from "./AppShell";
import {
  changeAppLanguage,
  consumePendingLoginLanguage,
  resolveAuthenticatedLanguage,
  useAppTranslation,
  type SupportedLanguage,
} from "../shared/i18n";
import { appQueryClient } from "./AppProviders";
import { useLessonRealtime } from "./controller/useLessonRealtime";
import { useMaterialActions } from "./controller/useMaterialActions";
import { useProfileActions } from "./controller/useProfileActions";
import { useScheduleActions } from "./controller/useScheduleActions";
import { useAppShellUiStore } from "./model/useAppShellUiStore";

export function useAppController(): AppShellProps {
  const { i18n, t } = useAppTranslation();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [appProfile, setAppProfile] = useState<AppUserProfile | null>(null);
  const [status, setStatus] = useState<SessionStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [completedAuthAction, setCompletedAuthAction] = useState<CompletedAuthAction | null>(null);
  const [authenticationMethods, setAuthenticationMethods] = useState<AuthenticationMethods | null>(null);
  const [authenticationMethodsLoading, setAuthenticationMethodsLoading] = useState(true);
  const [authenticationMethodsMessage, setAuthenticationMethodsMessage] = useState<string | null>(null);
  const resetShellUi = useAppShellUiStore((state) => state.resetShellUi);
  const setWorkspaceTab = useAppShellUiStore((state) => state.setWorkspaceTab);
  const workspaceTab = useAppShellUiStore((state) => state.workspaceTab);
  const [adminUsers, setAdminUsers] = useState<AdminUserProfile[]>([]);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [materials, setMaterials] = useState<LessonMaterial[]>([]);
  const [materialMessage, setMaterialMessage] = useState<string | null>(null);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [scheduledLessons, setScheduledLessons] = useState<ScheduledLesson[]>([]);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [studentUsers, setStudentUsers] = useState<AdminUserProfile[]>([]);
  const [roomSession, setRoomSession] = useState<LessonRoomSession | null>(null);
  const [roomLoadingLessonId, setRoomLoadingLessonId] = useState<string | null>(null);
  const [roomMessage, setRoomMessage] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const routeLessonId = classroomLessonIdFromPath(currentPath);
  const preparationLessonId = lessonPreparationIdFromPath(currentPath);
  const isProfileRoute = isProfilePath(currentPath);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      let callbackAuthAction: CompletedAuthAction | null = null;
      try {
        rememberChatTargetFromLocation();
        const currentUrl = new URL(window.location.href);
        if (isAuthCallback(currentUrl)) {
          await completeLogin(currentUrl);
          callbackAuthAction = consumeCompletedAuthAction();
          const returnPath = callbackAuthAction?.returnPath ?? "/";
          window.history.replaceState({}, document.title, returnPath);
          setCurrentPath(returnPath);
        }

        if (!readTokens()) {
          if (!isAuthCallback(currentUrl) && !consumeSkipSilentLogin()) {
            await startSilentLogin();
            return;
          }
          if (!cancelled) {
            if (isAuthCallback(currentUrl)) {
              window.history.replaceState({}, document.title, "/");
              setCurrentPath("/");
            }
            setStatus("anonymous");
          }
          return;
        }

        const me = await fetchMe();
        const canManagePeople = me.roles.includes("TEACHER") || me.roles.includes("ADMIN");
        const [currentAppProfile, currentAdminUsers, currentMaterials, currentSchedule, currentStudents, currentAuthenticationMethods] = await Promise.all([
          fetchUserProfile(),
          me.roles.includes("ADMIN") ? fetchAdminUserProfiles() : Promise.resolve([]),
          fetchMaterials(),
          fetchScheduledLessons(),
          canManagePeople ? fetchStudentProfiles() : Promise.resolve([]),
          fetchAuthenticationMethods().catch(() => null),
        ]);
        if (!cancelled) {
          let authenticatedAppProfile = currentAppProfile;
          const languageResolution = resolveAuthenticatedLanguage({
            pendingLanguage: consumePendingLoginLanguage(),
            profileLocale: currentAppProfile.locale,
          });

          if (languageResolution.language) {
            await changeAppLanguage(languageResolution.language);
          }

          if (languageResolution.language && languageResolution.shouldSaveProfile) {
            try {
              authenticatedAppProfile = await saveUserProfile(
                userProfileInputWithLanguage(currentAppProfile, languageResolution.language),
              );
            } catch (caught) {
              if (caught instanceof ApiError && caught.status === 401) {
                throw caught;
              }
              setProfileMessage(
                caught instanceof Error ? caught.message : i18n.t("profile.messages.saveFailed"),
              );
            }
          }

          setProfile(me);
          setAppProfile(authenticatedAppProfile);
          setAdminUsers(
            currentAdminUsers.map((user) =>
              user.subject === authenticatedAppProfile.subject ? authenticatedAppProfile : user,
            ),
          );
          setMaterials(currentMaterials);
          setScheduledLessons(currentSchedule);
          setStudentUsers(currentStudents);
          setAuthenticationMethods(currentAuthenticationMethods);
          setAuthenticationMethodsLoading(false);
          setAuthenticationMethodsMessage(
            currentAuthenticationMethods ? null : i18n.t("profile.passkeys.loadError"),
          );
          setCompletedAuthAction(resolveCompletedPasskeyAction(callbackAuthAction, currentAuthenticationMethods));
          setStatus("authenticated");
        }
      } catch (caught) {
        if (isSilentLoginUnavailable(caught)) {
          window.history.replaceState({}, document.title, "/");
          setCurrentPath("/");
          if (!cancelled) {
            setStatus("anonymous");
          }
          return;
        }
        clearTokens();
        if (!cancelled) {
          setAuthenticationMethodsLoading(false);
          setError(caught instanceof Error ? caught.message : t("errors.authFailed"));
          setStatus("error");
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeToPathnameHistory(window, setCurrentPath);
  }, []);

  const routeLesson = routeLessonId
    ? scheduledLessons.find((lesson) => lesson.id === routeLessonId) ?? null
    : null;
  const classroomLesson = routeLesson && (canAccessClassroomPreJoin(routeLesson, profile, nowMs))
    ? routeLesson
    : null;

  useEffect(() => {
    document.body.classList.toggle("playsay-classroom-active", classroomLesson !== null || roomSession !== null);
    return () => document.body.classList.remove("playsay-classroom-active");
  }, [classroomLesson, roomSession]);

  const isAuthenticated = status === "authenticated" && profile !== null;
  const isAdmin = profile?.roles.includes("ADMIN") ?? false;
  const canManagePeople = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  const isClassroomOpen = classroomLesson !== null || roomSession !== null;
  const workspaceTabs = workspaceTabsForProfile(profile);
  const nextJoinableLesson = [...scheduledLessons]
    .filter((lesson) => isJoinableScheduledLesson(lesson, nowMs))
    .sort((left, right) => compareJoinableLessons(left, right, nowMs))[0] ?? null;
  const anyLessonLoading = roomLoadingLessonId !== null;
  const nextLessonLoading = nextJoinableLesson ? roomLoadingLessonId === nextJoinableLesson.id : false;
  const {
    courseLessons,
    courseLoading,
    courseMessage,
    courseTopics,
    courses,
    createCourse,
    createLesson,
    createTopic,
    deleteCourse,
    deleteLesson,
    deleteTopic,
    refreshCourses,
    replaceLessonCards,
    setCourseLessonsForCourse,
    updateTopic,
  } = useCourseWorkspaceData({
    applySessionError,
    enabled: isAuthenticated,
  });

  async function refreshAuthenticationMethods(): Promise<void> {
    setAuthenticationMethodsLoading(true);
    setAuthenticationMethodsMessage(null);
    try {
      setAuthenticationMethods(await fetchAuthenticationMethods());
    } catch {
      setAuthenticationMethodsMessage(t("profile.passkeys.loadError"));
    } finally {
      setAuthenticationMethodsLoading(false);
    }
  }

  async function renamePasskey(credentialId: string, label: string): Promise<boolean> {
    setAuthenticationMethodsLoading(true);
    setAuthenticationMethodsMessage(null);
    try {
      setAuthenticationMethods(await renameAuthenticationPasskey(credentialId, { label }));
      setAuthenticationMethodsMessage(t("profile.passkeys.renamed"));
      return true;
    } catch {
      setAuthenticationMethodsMessage(t("profile.passkeys.renameError"));
      return false;
    } finally {
      setAuthenticationMethodsLoading(false);
    }
  }

  async function deletePasskey(credentialId: string): Promise<boolean> {
    setAuthenticationMethodsLoading(true);
    setAuthenticationMethodsMessage(null);
    try {
      setAuthenticationMethods(await deleteAuthenticationPasskey(credentialId));
      setAuthenticationMethodsMessage(t("profile.passkeys.deleted"));
      return true;
    } catch {
      setAuthenticationMethodsMessage(t("profile.passkeys.deleteError"));
      return false;
    } finally {
      setAuthenticationMethodsLoading(false);
    }
  }
  const {
    createPaymentInvoice,
    paymentInvoices,
    paymentLoading,
    paymentMessage,
    refreshPaymentInvoices,
  } = usePaymentInvoicesData({
    applySessionError,
    enabled: isAuthenticated && canManagePeople,
  });
  const {
    refreshAdminUsers,
    resetProfile,
    saveProfile,
  } = useProfileActions({
    applySessionError,
    isAdmin,
    setAdminLoading,
    setAdminMessage,
    setAdminUsers,
    setAppProfile,
    setProfileMessage,
    setProfileSaving,
  });
  const {
    deleteMaterial,
    generateImagesForMaterial,
    generateMaterialDraft,
    generateMaterialDraftFromUrl,
    linkMaterialToCourseLesson,
    refreshMaterials,
    suggestAcceptedAnswersForMaterial,
    updateMaterialAssetMetadata,
    upsertMaterial,
  } = useMaterialActions({
    applySessionError,
    setCourseLessonsForCourse,
    setMaterialLoading,
    setMaterialMessage,
    setMaterials,
  });
  const {
    assignMaterialToScheduledLesson,
    cancelScheduledLesson,
    completeScheduledLesson,
    confirmScheduledLessonJoin,
    closeClassroom,
    copyScheduledLessonLinks,
    createManagedStudent,
    createScheduledLesson,
    deleteScheduledLesson,
    joinScheduledLesson,
    leaveScheduledLessonRoom,
    refreshSchedule,
    rescheduleScheduledLesson,
    startScheduledLesson,
  } = useScheduleActions({
    applySessionError,
    navigateToPath,
    profile,
    scheduledLessons,
    setMaterialLoading,
    setRoomLoadingLessonId,
    setRoomMessage,
    setRoomSession,
    setScheduleLoading,
    setScheduleMessage,
    setScheduledLessons,
    setStudentUsers,
    studentUsers,
  });
  useLessonRealtime({
    applySessionError,
    classroomLessonId: classroomLesson?.id ?? null,
    closeClassroom,
    nowMs,
    profile,
    roomSession,
    setRoomSession,
    setScheduleMessage,
    setScheduledLessons,
    status,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!workspaceTabs.some((tab) => tab.id === workspaceTab)) {
      setWorkspaceTab("schedule");
    }
  }, [workspaceTab, workspaceTabs]);

  useEffect(() => {
    if (!routeLessonId && roomSession) {
      setRoomSession(null);
      setRoomMessage(null);
    }
  }, [routeLessonId, roomSession]);

  useEffect(() => {
    if (status !== "authenticated" || !routeLessonId || roomSession || roomLoadingLessonId) {
      return;
    }

    if (!routeLesson || !canAccessClassroomPreJoin(routeLesson, profile, nowMs)) {
      setRoomMessage(routeLesson && !isArchivedScheduleLesson(routeLesson, nowMs)
        ? t("schedule.messages.entryNotOpen")
        : t("schedule.messages.alreadyClosed"));
      navigateToPath("/");
    }
  }, [nowMs, profile, routeLesson, routeLessonId, roomLoadingLessonId, roomSession, status, t]);

  function openLessonPreparation(lessonId: string) {
    navigateToPath(lessonPreparationPath(lessonId));
  }

  function closeLessonPreparation() {
    navigateToPath("/");
  }

  function openProfile() {
    if (isProfileRoute) {
      return;
    }
    const nextPath = profilePath();
    window.history.pushState(profileHistoryState(currentPath), "", nextPath);
    setCurrentPath(nextPath);
  }

  function closeProfile() {
    if (!isProfileRoute) {
      return;
    }
    if (profileReturnPathFromHistoryState(window.history.state)) {
      window.history.back();
      return;
    }
    window.history.replaceState({}, "", "/");
    setCurrentPath("/");
  }

  function logout() {
    const logoutUrl = buildLogoutUrl();
    clearTokens();
    skipSilentLoginOnce();
    appQueryClient.clear();
    setProfile(null);
    setAppProfile(null);
    setAuthenticationMethods(null);
    setAuthenticationMethodsMessage(null);
    setAdminUsers([]);
    setMaterials([]);
    setScheduledLessons([]);
    setStudentUsers([]);
    setRoomSession(null);
    setRoomLoadingLessonId(null);
    setRoomMessage(null);
    resetShellUi();
    setStatus("loggingOut");
    window.location.assign(logoutUrl);
  }

  function applySessionError(caught: unknown, fallback: string): string {
    const message = caught instanceof Error ? caught.message : fallback;
    if (
      (caught instanceof ApiError && caught.status === 401) ||
      message.includes("Not authenticated") ||
      message.includes("HTTP 401")
    ) {
      clearTokens();
      appQueryClient.clear();
      setProfile(null);
      setAppProfile(null);
      setAuthenticationMethods(null);
      setAuthenticationMethodsMessage(null);
      setAdminUsers([]);
      setMaterials([]);
      setScheduledLessons([]);
      setStudentUsers([]);
      setRoomSession(null);
      setRoomLoadingLessonId(null);
      setRoomMessage(null);
      resetShellUi();
      setStatus("anonymous");
      return t("errors.sessionExpired");
    }
    return message;
  }

  function navigateToPath(path: string) {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
  }


  return {
    adminLoading,
    adminMessage,
    adminUsers,
    authenticationMethods,
    authenticationMethodsLoading,
    authenticationMethodsMessage,
    anyLessonLoading,
    appProfile,
    assignMaterialToScheduledLesson,
    cancelScheduledLesson,
    completeScheduledLesson,
    copyScheduledLessonLinks,
    courseLessons,
    courseLoading,
    courseMessage,
    courseTopics,
    courses,
    createCourse,
    createLesson,
    createTopic,
    createScheduledLesson,
    createManagedStudent,
    deleteCourse,
    deletePasskey,
    deleteLesson,
    deleteMaterial,
    deleteScheduledLesson,
    deleteTopic,
    error,
    generateImagesForMaterial,
    generateMaterialDraft,
    generateMaterialDraftFromUrl,
    isAdmin,
    isAuthenticated,
    isClassroomOpen,
    isProfileRoute,
    joinScheduledLesson,
    leaveScheduledLessonRoom,
    linkMaterialToCourseLesson,
    logout,
    materialLoading,
    materialMessage,
    materials,
    nextJoinableLesson,
    nextLessonLoading,
    nowMs,
    paymentInvoices,
    paymentLoading,
    paymentMessage,
    preparationLessonId,
    profile,
    profileMessage,
    profileSaving,
    refreshAdminUsers,
    refreshAuthenticationMethods,
    refreshCourses,
    refreshMaterials,
    refreshPaymentInvoices,
    refreshSchedule,
    rescheduleScheduledLesson,
    renamePasskey,
    resetProfile,
    roomLoadingLessonId,
    roomMessage,
    roomSession,
    saveProfile,
    scheduleLoading,
    scheduleMessage,
    scheduledLessons,
    setWorkspaceTab,
    status,
    startScheduledLesson,
    studentUsers,
    replaceLessonCards,
    createPaymentInvoice,
    suggestAcceptedAnswersForMaterial,
    updateMaterialAssetMetadata,
    updateTopic,
    upsertMaterial,
    workspaceTab,
    workspaceTabs,
    openProfile,
    closeProfile,
    openLessonPreparation,
    closeLessonPreparation,
    classroomLesson,
    completedAuthAction,
    confirmScheduledLessonJoin,
  };
}

function resolveCompletedPasskeyAction(
  action: CompletedAuthAction | null,
  methods: AuthenticationMethods | null,
): CompletedAuthAction | null {
  if (!action || action.status !== "pending") {
    return action;
  }
  return {
    ...action,
    status: methods && methods.passkeys.length > action.passkeyCountBefore ? "success" : "failed",
  };
}

function canAccessClassroomPreJoin(lesson: ScheduledLesson, profile: MeProfile | null, nowMs: number): boolean {
  const isAuthenticatedClassroomRole = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN" || role === "STUDENT") ?? false;
  return isAuthenticatedClassroomRole && isJoinableScheduledLesson(lesson, nowMs);
}

function userProfileInputWithLanguage(profile: AppUserProfile, language: SupportedLanguage): UpdateUserProfileInput {
  return {
    displayName: profile.displayName ?? null,
    countryCode: profile.countryCode ?? null,
    learningGoal: profile.learningGoal ?? null,
    locale: language,
    timezone: profile.timezone ?? null,
  };
}
