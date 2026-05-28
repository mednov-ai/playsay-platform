import { useEffect, useRef, useState } from "react";
import { type WorkspaceTab, workspaceTabsForProfile } from "../entities/workspace/model";
import { compareJoinableLessons, isJoinableScheduledLesson, type CourseLessonMap } from "../entities/schedule/model";
import {
  archiveMaterial,
  buildLogoutUrl,
  clearTokens,
  completeLogin,
  draftMaterial,
  draftMaterialFromUrl,
  enterScheduledLessonRoom,
  editCourseLesson,
  editScheduledLesson,
  fetchAdminUserProfiles,
  fetchCourseLessons,
  fetchCourses,
  fetchMaterials,
  fetchMe,
  fetchScheduledLessons,
  fetchStudentProfiles,
  fetchUserProfile,
  getValidAccessToken,
  generateMaterialImages,
  isAuthCallback,
  removeCourse,
  removeCourseLesson,
  removeScheduledLesson,
  readTokens,
  resetUserProfile,
  saveCourse,
  saveCourseLesson,
  saveMaterial,
  saveScheduledLesson,
  saveUserProfile,
  updateMaterialAsset,
  type AdminUserProfile,
  type AppUserProfile,
  type Course,
  type CourseInput,
  type CourseLesson,
  type CourseLessonInput,
  type LessonMaterial,
  type LessonMaterialAsset,
  type LessonMaterialAssetUpdateInput,
  type LessonMaterialDraft,
  type LessonMaterialDraftInput,
  type LessonMaterialGenerateImagesInput,
  type LessonMaterialInput,
  type LessonMaterialUrlDraftInput,
  type MeProfile,
  type ScheduledLesson,
  type ScheduledLessonInput,
  type UpdateUserProfileInput,
} from "../shared/api/playsay";
import { classroomLessonIdFromPath, classroomPath } from "./routes";
import type { SessionStatus } from "../features/profile/ui/ProfileAccountPanel";
import { fetchCourseBundle } from "../features/courses";
import {
  buildLessonRealtimeUrl,
  isRoomSessionExpired,
  roomSessionFromScheduledLesson,
  type LessonRoomSession,
  upsertScheduledLesson,
} from "../features/classroom";
import type { AppShellProps } from "./AppShell";

type LessonRealtimeMessage = {
  type?: string;
  lesson?: ScheduledLesson;
  lessonId?: string;
  message?: string;
};

export function useAppController(): AppShellProps {
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
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const realtimeReconnectTimerRef = useRef<number | null>(null);
  const roomSessionRef = useRef<LessonRoomSession | null>(null);
  const scheduleSyncInFlightRef = useRef(false);
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
          if (!cancelled) {
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
          setProfile(me);
          setAppProfile(currentAppProfile);
          setAdminUsers(currentAdminUsers);
          setCourses(currentCourseBundle.courses);
          setCourseLessons(currentCourseBundle.lessons);
          setMaterials(currentMaterials);
          setScheduledLessons(currentSchedule);
          setStudentUsers(currentStudents);
          setStatus("authenticated");
        }
      } catch (caught) {
        clearTokens();
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Auth failed.");
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

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    roomSessionRef.current = roomSession;
  }, [roomSession]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const canManageSchedule = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
    if (!canManageSchedule) {
      setScheduledLessons((current) => current.filter((lesson) => isJoinableScheduledLesson(lesson, nowMs)));
    }

    if (roomSession && isRoomSessionExpired(roomSession, nowMs)) {
      closeClassroom("Занятие завершено");
    }
  }, [nowMs, profile?.roles, roomSession, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      realtimeSocketRef.current?.close();
      realtimeSocketRef.current = null;
      if (realtimeReconnectTimerRef.current !== null) {
        window.clearTimeout(realtimeReconnectTimerRef.current);
        realtimeReconnectTimerRef.current = null;
      }
      return undefined;
    }

    let closed = false;

    async function connectRealtime() {
      const accessToken = await getValidAccessToken();
      if (closed || !accessToken) {
        return;
      }

      const socket = new WebSocket(buildLessonRealtimeUrl(), ["playsay", accessToken]);
      realtimeSocketRef.current = socket;

      socket.onopen = () => {
        const activeLessonId = roomSessionRef.current?.lessonId;
        if (activeLessonId) {
          sendLessonRealtimeSubscribe(activeLessonId);
        }
      };

      socket.onmessage = (event) => {
        handleLessonRealtimeMessage(event.data);
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onclose = () => {
        if (realtimeSocketRef.current === socket) {
          realtimeSocketRef.current = null;
        }
        if (!closed) {
          realtimeReconnectTimerRef.current = window.setTimeout(() => {
            realtimeReconnectTimerRef.current = null;
            void connectRealtime();
          }, 2_000);
        }
      };
    }

    void connectRealtime();

    return () => {
      closed = true;
      if (realtimeReconnectTimerRef.current !== null) {
        window.clearTimeout(realtimeReconnectTimerRef.current);
        realtimeReconnectTimerRef.current = null;
      }
      realtimeSocketRef.current?.close();
      realtimeSocketRef.current = null;
    };
  }, [status]);

  useEffect(() => {
    if (roomSession?.lessonId) {
      sendLessonRealtimeSubscribe(roomSession.lessonId);
    }
  }, [roomSession?.lessonId]);

  async function syncScheduleFromServer(options: { message?: string } = {}) {
    if (scheduleSyncInFlightRef.current) {
      return;
    }

    scheduleSyncInFlightRef.current = true;
    try {
      const freshSchedule = await fetchScheduledLessons();
      setScheduledLessons(freshSchedule);
      if (options.message) {
        setScheduleMessage(options.message);
      }
    } catch (caught) {
      applySessionError(caught, "Не удалось обновить расписание");
    } finally {
      scheduleSyncInFlightRef.current = false;
    }
  }

  function handleLessonRealtimeMessage(rawPayload: string) {
    let message: LessonRealtimeMessage;
    try {
      message = JSON.parse(rawPayload) as LessonRealtimeMessage;
    } catch {
      return;
    }

    if (message.type === "schedule.changed") {
      void syncScheduleFromServer();
      return;
    }

    if (message.type === "lesson.updated" && message.lesson) {
      applyRealtimeLessonSnapshot(message.lesson);
      return;
    }

    if (message.type === "lesson.deleted" && message.lessonId) {
      removeRealtimeLesson(message.lessonId, "Занятие больше недоступно");
    }
  }

  function applyRealtimeLessonSnapshot(lesson: ScheduledLesson) {
    const currentTimeMs = Date.now();
    const canManageSchedule = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
    const canKeepInSchedule = canManageSchedule || isJoinableScheduledLesson(lesson, currentTimeMs);

    setScheduledLessons((current) => (
      canKeepInSchedule
        ? upsertScheduledLesson(current, lesson)
        : current.filter((item) => item.id !== lesson.id)
    ));

    if (roomSessionRef.current?.lessonId !== lesson.id) {
      return;
    }

    if (!isJoinableScheduledLesson(lesson, currentTimeMs)) {
      closeClassroom("Занятие завершено или отменено");
      return;
    }

    setRoomSession((current) => (
      current?.lessonId === lesson.id
        ? roomSessionFromScheduledLesson(current, lesson)
        : current
    ));
  }

  function removeRealtimeLesson(lessonId: string, message: string) {
    setScheduledLessons((current) => current.filter((lesson) => lesson.id !== lessonId));
    if (roomSessionRef.current?.lessonId === lessonId) {
      closeClassroom(message);
    }
  }

  function sendLessonRealtimeSubscribe(lessonId: string) {
    const socket = realtimeSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      socket.send(JSON.stringify({ type: "subscribe.lesson", lessonId }));
    } catch {
      socket.close();
    }
  }

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
        setRoomMessage("Занятие уже завершено или отменено");
        return;
      }
      void joinScheduledLesson(routeLesson, { updateRoute: false });
    }
  }, [nowMs, routeLessonId, roomLoadingLessonId, roomSession, scheduledLessons, status]);

  function logout() {
    const logoutUrl = buildLogoutUrl();
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
    setStatus("loggingOut");
    window.location.assign(logoutUrl);
  }

  function applySessionError(caught: unknown, fallback: string): string {
    const message = caught instanceof Error ? caught.message : fallback;
    if (message.includes("Not authenticated") || message.includes("HTTP 401")) {
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
      return "Сессия истекла, войдите снова";
    }
    return message;
  }

  async function saveProfile(input: UpdateUserProfileInput) {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const updated = await saveUserProfile(input);
      setAppProfile(updated);
      setAdminUsers((current) =>
        current.map((user) => (user.subject === updated.subject ? updated : user)),
      );
      setProfileMessage("Профиль сохранён");
    } catch (caught) {
      setProfileMessage(applySessionError(caught, "Не удалось сохранить профиль"));
    } finally {
      setProfileSaving(false);
    }
  }

  async function resetProfile() {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      await resetUserProfile();
      const recreated = await fetchUserProfile();
      setAppProfile(recreated);
      setAdminUsers((current) =>
        current.map((user) => (user.subject === recreated.subject ? recreated : user)),
      );
      setProfileMessage("Профиль сброшен");
    } catch (caught) {
      setProfileMessage(applySessionError(caught, "Не удалось сбросить профиль"));
    } finally {
      setProfileSaving(false);
    }
  }

  async function refreshAdminUsers() {
    if (!isAdmin) {
      return;
    }

    setAdminLoading(true);
    setAdminMessage(null);
    try {
      setAdminUsers(await fetchAdminUserProfiles());
    } catch (caught) {
      setAdminMessage(applySessionError(caught, "Не удалось загрузить пользователей"));
    } finally {
      setAdminLoading(false);
    }
  }

  async function refreshCourses() {
    setCourseLoading(true);
    setCourseMessage(null);
    try {
      const bundle = await fetchCourseBundle();
      setCourses(bundle.courses);
      setCourseLessons(bundle.lessons);
      setCourseMessage("Курсы обновлены");
    } catch (caught) {
      setCourseMessage(applySessionError(caught, "Не удалось загрузить курсы"));
    } finally {
      setCourseLoading(false);
    }
  }

  async function createCourse(input: CourseInput) {
    setCourseLoading(true);
    setCourseMessage(null);
    try {
      await saveCourse(input);
      const bundle = await fetchCourseBundle();
      setCourses(bundle.courses);
      setCourseLessons(bundle.lessons);
      setCourseMessage("Курс создан");
    } catch (caught) {
      setCourseMessage(applySessionError(caught, "Не удалось создать курс"));
    } finally {
      setCourseLoading(false);
    }
  }

  async function deleteCourse(courseId: string) {
    setCourseLoading(true);
    setCourseMessage(null);
    try {
      await removeCourse(courseId);
      setCourses((current) => current.filter((course) => course.id !== courseId));
      setCourseLessons((current) => {
        const next = { ...current };
        delete next[courseId];
        return next;
      });
      setCourseMessage("Курс удалён");
    } catch (caught) {
      setCourseMessage(applySessionError(caught, "Не удалось удалить курс"));
    } finally {
      setCourseLoading(false);
    }
  }

  async function createLesson(courseId: string, input: CourseLessonInput) {
    setCourseLoading(true);
    setCourseMessage(null);
    try {
      await saveCourseLesson(courseId, input);
      const [freshCourses, lessons] = await Promise.all([fetchCourses(), fetchCourseLessons(courseId)]);
      setCourses(freshCourses);
      setCourseLessons((current) => ({ ...current, [courseId]: lessons }));
      setCourseMessage("Урок добавлен");
    } catch (caught) {
      setCourseMessage(applySessionError(caught, "Не удалось добавить урок"));
    } finally {
      setCourseLoading(false);
    }
  }

  async function deleteLesson(courseId: string, lessonId: string) {
    setCourseLoading(true);
    setCourseMessage(null);
    try {
      await removeCourseLesson(courseId, lessonId);
      const [freshCourses, lessons] = await Promise.all([fetchCourses(), fetchCourseLessons(courseId)]);
      setCourses(freshCourses);
      setCourseLessons((current) => ({ ...current, [courseId]: lessons }));
      setCourseMessage("Урок удалён");
    } catch (caught) {
      setCourseMessage(applySessionError(caught, "Не удалось удалить урок"));
    } finally {
      setCourseLoading(false);
    }
  }

  async function refreshMaterials() {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      setMaterials(await fetchMaterials());
      setMaterialMessage("Материалы обновлены");
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, "Не удалось загрузить материалы"));
    } finally {
      setMaterialLoading(false);
    }
  }

  async function upsertMaterial(input: LessonMaterialInput, materialId?: string): Promise<LessonMaterial | null> {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      const saved = await saveMaterial(input, materialId);
      setMaterials((current) => {
        const exists = current.some((material) => material.id === saved.id);
        return exists
          ? current.map((material) => (material.id === saved.id ? saved : material))
          : [saved, ...current];
      });
      setMaterialMessage(materialId ? "Материал сохранён" : "Материал создан");
      return saved;
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, "Не удалось сохранить материал"));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function generateMaterialDraft(input: LessonMaterialDraftInput): Promise<LessonMaterialDraft | null> {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      const draft = await draftMaterial(input);
      setMaterialMessage("Черновик подготовлен");
      return draft;
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, "Не удалось подготовить черновик"));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function generateMaterialDraftFromUrl(input: LessonMaterialUrlDraftInput): Promise<LessonMaterialDraft | null> {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      const draft = await draftMaterialFromUrl(input);
      setMaterialMessage("Черновик из ссылки подготовлен");
      return draft;
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, "Не удалось подготовить черновик из ссылки"));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function generateImagesForMaterial(
    materialId: string,
    input: LessonMaterialGenerateImagesInput,
  ): Promise<LessonMaterial | null> {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      const material = await generateMaterialImages(materialId, input);
      setMaterials((current) => current.map((item) => (item.id === material.id ? material : item)));
      setMaterialMessage("Картинки сгенерированы");
      return material;
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, "Не удалось сгенерировать картинки"));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function updateMaterialAssetMetadata(
    materialId: string,
    assetId: string,
    input: LessonMaterialAssetUpdateInput,
  ): Promise<LessonMaterialAsset | null> {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      const asset = await updateMaterialAsset(materialId, assetId, input);
      setMaterialMessage("Теги картинки обновлены");
      return asset;
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, "Не удалось обновить теги картинки"));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function deleteMaterial(materialId: string) {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      await archiveMaterial(materialId);
      setMaterials((current) => current.filter((material) => material.id !== materialId));
      setMaterialMessage("Материал архивирован");
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, "Не удалось архивировать материал"));
    } finally {
      setMaterialLoading(false);
    }
  }

  async function linkMaterialToCourseLesson(courseId: string, lesson: CourseLesson, materialId: string | null) {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      await editCourseLesson(courseId, lesson.id, {
        title: lesson.title,
        orderIndex: lesson.orderIndex ?? null,
        plannedDurationMin: lesson.plannedDurationMin ?? null,
        materialId,
      });
      const lessons = await fetchCourseLessons(courseId);
      setCourseLessons((current) => ({ ...current, [courseId]: lessons }));
      setMaterialMessage(materialId ? "Материал привязан к уроку" : "Материал отвязан от урока");
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, "Не удалось привязать материал"));
    } finally {
      setMaterialLoading(false);
    }
  }

  async function refreshSchedule() {
    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      const canManagePeople = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
      const [freshSchedule, freshStudents] = await Promise.all([
        fetchScheduledLessons(),
        canManagePeople ? fetchStudentProfiles() : Promise.resolve(studentUsers),
      ]);
      setScheduledLessons(freshSchedule);
      setStudentUsers(freshStudents);
      setScheduleMessage("Расписание обновлено");
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, "Не удалось загрузить расписание"));
    } finally {
      setScheduleLoading(false);
    }
  }

  async function createScheduledLesson(input: ScheduledLessonInput) {
    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      await saveScheduledLesson(input);
      setScheduledLessons(await fetchScheduledLessons());
      setScheduleMessage("Занятие добавлено");
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, "Не удалось добавить занятие"));
    } finally {
      setScheduleLoading(false);
    }
  }

  async function assignMaterialToScheduledLesson(lessonId: string, materialId: string | null): Promise<ScheduledLesson | null> {
    const lesson = scheduledLessons.find((item) => item.id === lessonId);
    if (!lesson) {
      setRoomMessage("Занятие не найдено в расписании");
      return null;
    }

    setMaterialLoading(true);
    setRoomMessage(null);
    try {
      const updated = await editScheduledLesson(lessonId, {
        lessonTemplateId: lesson.lessonTemplateId ?? null,
        materialId,
        scheduledStart: lesson.scheduledStart ?? null,
        scheduledEnd: lesson.scheduledEnd ?? null,
        status: lesson.status as ScheduledLessonInput["status"],
        type: lesson.type === "INDIVIDUAL" ? "INDIVIDUAL" : "GROUP",
        participantSubjects: lesson.participants.map((participant) => participant.subject),
      });
      setScheduledLessons((current) => current.map((item) => (item.id === lessonId ? updated : item)));
      setRoomSession((current) => (
        current?.lessonId === lessonId
          ? {
              ...current,
              lessonEndsAt: updated.scheduledEnd ?? current.lessonEndsAt,
              lessonStartsAt: updated.scheduledStart ?? current.lessonStartsAt,
              lessonStatus: updated.status,
              lessonTitle: updated.lessonTitle ?? current.lessonTitle,
              lessonType: updated.type,
              materialId: updated.materialId ?? null,
              participants: updated.participants,
            }
          : current
      ));
      setRoomMessage(materialId ? "Материал назначен" : "Материал снят");
      return updated;
    } catch (caught) {
      setRoomMessage(applySessionError(caught, "Не удалось назначить материал"));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function cancelScheduledLesson(lesson: ScheduledLesson) {
    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      await editScheduledLesson(lesson.id, {
        lessonTemplateId: lesson.lessonTemplateId ?? null,
        materialId: lesson.materialId ?? null,
        scheduledStart: lesson.scheduledStart ?? null,
        scheduledEnd: lesson.scheduledEnd ?? null,
        status: "CANCELLED",
        type: lesson.type === "INDIVIDUAL" ? "INDIVIDUAL" : "GROUP",
        participantSubjects: lesson.participants.map((participant) => participant.subject),
      });
      setScheduledLessons(await fetchScheduledLessons());
      setScheduleMessage("Занятие отменено");
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, "Не удалось отменить занятие"));
    } finally {
      setScheduleLoading(false);
    }
  }

  async function deleteScheduledLesson(lessonId: string) {
    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      await removeScheduledLesson(lessonId);
      setScheduledLessons((current) => current.filter((lesson) => lesson.id !== lessonId));
      setRoomSession((current) => (current?.roomName === `lesson-${lessonId}` ? null : current));
      setScheduleMessage("Занятие удалено");
    } catch (caught) {
      setScheduleMessage(applySessionError(caught, "Не удалось удалить занятие"));
    } finally {
      setScheduleLoading(false);
    }
  }

  async function joinScheduledLesson(
    lesson: ScheduledLesson,
    options: { updateRoute?: boolean } = {},
  ) {
    setRoomLoadingLessonId(lesson.id);
    setRoomMessage(null);
    try {
      const token = await enterScheduledLessonRoom(lesson.id);
      if (options.updateRoute ?? true) {
        navigateToPath(classroomPath(lesson.id));
      }
      setRoomSession({
        ...token,
        courseTitle: lesson.courseTitle ?? null,
        lessonId: lesson.id,
        lessonEndsAt: lesson.scheduledEnd ?? null,
        lessonTemplateId: lesson.lessonTemplateId ?? null,
        lessonStartsAt: lesson.scheduledStart ?? null,
        lessonStatus: lesson.status,
        lessonTitle: lesson.lessonTitle ?? lesson.courseTitle ?? "Занятие",
        lessonType: lesson.type,
        materialId: lesson.materialId ?? null,
        participants: lesson.participants,
        teacherName: lesson.teacherName ?? null,
      });
      setRoomMessage("Комната готова");
    } catch (caught) {
      setRoomMessage(applySessionError(caught, "Не удалось открыть видеокомнату"));
    } finally {
      setRoomLoadingLessonId(null);
    }
  }

  function leaveScheduledLessonRoom() {
    closeClassroom(null);
  }

  function closeClassroom(message: string | null) {
    setRoomSession(null);
    setRoomMessage(message);
    if (classroomLessonIdFromPath(window.location.pathname)) {
      navigateToPath("/");
    }
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
    updateMaterialAssetMetadata,
    upsertMaterial,
    workspaceTab,
    workspaceTabs,
  };
}
