import { useEffect, useState } from "react";
import { type WorkspaceTab, workspaceTabsForProfile } from "../entities/workspace/model";
import { compareJoinableLessons, isJoinableScheduledLesson, type CourseLessonMap } from "../entities/schedule/model";
import {
  ApiError,
  buildLogoutUrl,
  clearTokens,
  completeLogin,
  consumeSkipSilentLogin,
  fetchAdminUserProfiles,
  fetchMaterials,
  fetchMe,
  fetchScheduledLessons,
  fetchStudentProfiles,
  fetchUserProfile,
  isSilentLoginUnavailable,
  isAuthCallback,
  readTokens,
  saveUserProfile,
  skipSilentLoginOnce,
  startSilentLogin,
  type AdminUserProfile,
  type AppUserProfile,
  type Course,
  type LessonMaterial,
  type MeProfile,
  type ScheduledLesson,
  type UpdateUserProfileInput,
} from "../shared/api/playsay";
import { classroomLessonIdFromPath } from "./routes";
import type { SessionStatus } from "../features/profile/ui/ProfileAccountPanel";
import { fetchCourseBundle } from "../features/courses";
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
import { useCourseActions } from "./controller/useCourseActions";
import { useLessonRealtime } from "./controller/useLessonRealtime";
import { useMaterialActions } from "./controller/useMaterialActions";
import { useProfileActions } from "./controller/useProfileActions";
import { useScheduleActions } from "./controller/useScheduleActions";

export function useAppController(): AppShellProps {
  const { i18n, t } = useAppTranslation();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [appProfile, setAppProfile] = useState<AppUserProfile | null>(null);
  const [status, setStatus] = useState<SessionStatus>("checking");
  const [error, setError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUserProfile[]>([]);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseLessons, setCourseLessons] = useState<CourseLessonMap>({});
  const [courseMessage, setCourseMessage] = useState<string | null>(null);
  const [courseLoading, setCourseLoading] = useState(false);
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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("schedule");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const routeLessonId = classroomLessonIdFromPath(currentPath);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const currentUrl = new URL(window.location.href);
        if (isAuthCallback(currentUrl)) {
          await completeLogin(currentUrl);
          window.history.replaceState({}, document.title, "/");
          setCurrentPath("/");
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
        const [currentAppProfile, currentAdminUsers, currentCourseBundle, currentMaterials, currentSchedule, currentStudents] = await Promise.all([
          fetchUserProfile(),
          me.roles.includes("ADMIN") ? fetchAdminUserProfiles() : Promise.resolve([]),
          fetchCourseBundle(),
          fetchMaterials(),
          fetchScheduledLessons(),
          canManagePeople ? fetchStudentProfiles() : Promise.resolve([]),
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
          setCourses(currentCourseBundle.courses);
          setCourseLessons(currentCourseBundle.lessons);
          setMaterials(currentMaterials);
          setScheduledLessons(currentSchedule);
          setStudentUsers(currentStudents);
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
    function updatePathFromHistory() {
      setCurrentPath(window.location.pathname);
    }

    window.addEventListener("popstate", updatePathFromHistory);
    return () => window.removeEventListener("popstate", updatePathFromHistory);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("playsay-classroom-active", roomSession !== null);
    return () => document.body.classList.remove("playsay-classroom-active");
  }, [roomSession]);

  const isAuthenticated = status === "authenticated" && profile !== null;
  const isAdmin = profile?.roles.includes("ADMIN") ?? false;
  const isClassroomOpen = roomSession !== null;
  const workspaceTabs = workspaceTabsForProfile(profile);
  const nextJoinableLesson = [...scheduledLessons]
    .filter((lesson) => isJoinableScheduledLesson(lesson, nowMs))
    .sort((left, right) => compareJoinableLessons(left, right, nowMs))[0] ?? null;
  const anyLessonLoading = roomLoadingLessonId !== null;
  const nextLessonLoading = nextJoinableLesson ? roomLoadingLessonId === nextJoinableLesson.id : false;
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
    createCourse,
    createLesson,
    deleteCourse,
    deleteLesson,
    refreshCourses,
  } = useCourseActions({
    applySessionError,
    setCourseLessons,
    setCourseLoading,
    setCourseMessage,
    setCourses,
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
    setCourseLessons,
    setMaterialLoading,
    setMaterialMessage,
    setMaterials,
  });
  const {
    assignMaterialToScheduledLesson,
    cancelScheduledLesson,
    closeClassroom,
    createScheduledLesson,
    deleteScheduledLesson,
    joinScheduledLesson,
    leaveScheduledLessonRoom,
    refreshSchedule,
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

    const routeLesson = scheduledLessons.find((lesson) => lesson.id === routeLessonId);
    if (routeLesson) {
      if (!isJoinableScheduledLesson(routeLesson, nowMs)) {
        setRoomMessage(t("schedule.messages.alreadyClosed"));
        return;
      }
      void joinScheduledLesson(routeLesson, { updateRoute: false });
    }
  }, [nowMs, routeLessonId, roomLoadingLessonId, roomSession, scheduledLessons, status]);

  function logout() {
    const logoutUrl = buildLogoutUrl();
    clearTokens();
    skipSilentLoginOnce();
    setProfile(null);
    setAppProfile(null);
    setAdminUsers([]);
    setCourses([]);
    setCourseLessons({});
    setMaterials([]);
    setScheduledLessons([]);
    setStudentUsers([]);
    setRoomSession(null);
    setRoomLoadingLessonId(null);
    setRoomMessage(null);
    setProfileOpen(false);
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
      setProfile(null);
      setAppProfile(null);
      setAdminUsers([]);
      setCourses([]);
      setCourseLessons({});
      setMaterials([]);
      setScheduledLessons([]);
      setStudentUsers([]);
      setRoomSession(null);
      setRoomLoadingLessonId(null);
      setRoomMessage(null);
      setProfileOpen(false);
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
    anyLessonLoading,
    appProfile,
    assignMaterialToScheduledLesson,
    cancelScheduledLesson,
    courseLessons,
    courseLoading,
    courseMessage,
    courses,
    createCourse,
    createLesson,
    createScheduledLesson,
    deleteCourse,
    deleteLesson,
    deleteMaterial,
    deleteScheduledLesson,
    error,
    generateImagesForMaterial,
    generateMaterialDraft,
    generateMaterialDraftFromUrl,
    isAdmin,
    isAuthenticated,
    isClassroomOpen,
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
    profile,
    profileMessage,
    profileOpen,
    profileSaving,
    refreshAdminUsers,
    refreshCourses,
    refreshMaterials,
    refreshSchedule,
    resetProfile,
    roomLoadingLessonId,
    roomMessage,
    roomSession,
    saveProfile,
    scheduleLoading,
    scheduleMessage,
    scheduledLessons,
    setProfileOpen,
    setWorkspaceTab,
    status,
    studentUsers,
    suggestAcceptedAnswersForMaterial,
    updateMaterialAssetMetadata,
    upsertMaterial,
    workspaceTab,
    workspaceTabs,
  };
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
