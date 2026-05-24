import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent, type ReactNode } from "react";
import {
  ConnectionStateToast,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  StartMediaButton,
  TrackLoop,
  TrackToggle,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Eraser,
  FileText,
  Loader2,
  LogIn,
  LogOut,
  MousePointer2,
  Paperclip,
  PenLine,
  PhoneOff,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
  User,
  Users,
  Video,
} from "lucide-react";
import {
  buildLogoutUrl,
  clearTokens,
  completeLogin,
  enterScheduledLessonRoom,
  editScheduledLesson,
  fetchAdminUserProfiles,
  fetchCourseLessons,
  fetchCourses,
  fetchMe,
  fetchScheduledLessons,
  fetchStudentProfiles,
  fetchUserProfile,
  isAuthCallback,
  removeCourse,
  removeCourseLesson,
  removeScheduledLesson,
  readTokens,
  resetUserProfile,
  saveCourse,
  saveCourseLesson,
  saveScheduledLesson,
  saveUserProfile,
  startLogin,
  type AdminUserProfile,
  type AppUserProfile,
  type Course,
  type CourseInput,
  type CourseLesson,
  type CourseLessonInput,
  type LiveKitRoomToken,
  type MeProfile,
  type ScheduledLesson,
  type ScheduledLessonInput,
  type UpdateUserProfileInput,
} from "./auth";
import { Button } from "./components/ui/button";

type SessionStatus = "checking" | "anonymous" | "authenticated" | "loggingOut" | "error";

type ProfileFormState = {
  displayName: string;
  locale: string;
  timezone: string;
  learningGoal: string;
};

type CourseLessonMap = Record<string, CourseLesson[]>;

type CourseFormState = {
  title: string;
  description: string;
  level: string;
  language: string;
  isPublished: boolean;
};

type LessonFormState = {
  title: string;
  orderIndex: string;
  plannedDurationMin: string;
};

type ScheduleFormState = {
  lessonTemplateId: string;
  scheduledStart: string;
  scheduledEnd: string;
  type: "INDIVIDUAL" | "GROUP";
  participantSubjects: string;
};

type LessonRoomSession = LiveKitRoomToken & {
  courseTitle: string | null;
  lessonEndsAt: string | null;
  lessonStartsAt: string | null;
  lessonTitle: string;
  lessonType: string;
  participants: ScheduledLesson["participants"];
  teacherName: string | null;
};

type AnnotationTool = "pointer" | "pen" | "eraser";

type AnnotationPoint = {
  x: number;
  y: number;
};

type AnnotationStroke = {
  color: string;
  id: string;
  points: AnnotationPoint[];
};

export function App() {
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
        const [currentAppProfile, currentAdminUsers, currentCourseBundle, currentSchedule, currentStudents] = await Promise.all([
          fetchUserProfile(),
          me.roles.includes("ADMIN") ? fetchAdminUserProfiles() : Promise.resolve([]),
          fetchCourseBundle(),
          fetchScheduledLessons(),
          canManagePeople ? fetchStudentProfiles() : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setProfile(me);
          setAppProfile(currentAppProfile);
          setAdminUsers(currentAdminUsers);
          setCourses(currentCourseBundle.courses);
          setCourseLessons(currentCourseBundle.lessons);
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

  async function cancelScheduledLesson(lesson: ScheduledLesson) {
    setScheduleLoading(true);
    setScheduleMessage(null);
    try {
      await editScheduledLesson(lesson.id, {
        lessonTemplateId: lesson.lessonTemplateId ?? null,
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
        lessonEndsAt: lesson.scheduledEnd ?? null,
        lessonStartsAt: lesson.scheduledStart ?? null,
        lessonTitle: lesson.lessonTitle ?? lesson.courseTitle ?? "Занятие",
        lessonType: lesson.type,
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
    setRoomSession(null);
    setRoomMessage(null);
    if (classroomLessonIdFromPath(window.location.pathname)) {
      navigateToPath("/");
    }
  }

  function navigateToPath(path: string) {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
  }

  return (
    <main className={`${isClassroomOpen ? "h-dvh overflow-hidden" : "min-h-screen overflow-hidden"} bg-background text-foreground`}>
      <section
        className={`mx-auto flex w-full flex-col ${
          isClassroomOpen
            ? "h-full max-w-[92rem] gap-3 px-3 py-3 sm:px-4"
            : "min-h-screen max-w-6xl gap-7 px-5 py-6 sm:px-8"
        }`}
      >
        {isClassroomOpen ? null : (
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <BrandMark />
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isAuthenticated ? (
                <>
                  <Button
                    className="min-w-40"
                    disabled={!nextJoinableLesson || anyLessonLoading}
                    onClick={() => {
                      if (nextJoinableLesson) {
                        void joinScheduledLesson(nextJoinableLesson);
                      }
                    }}
                    type="button"
                  >
                    {nextLessonLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                    Войти в урок
                  </Button>
                  <Button
                    aria-expanded={profileOpen}
                    onClick={() => setProfileOpen((current) => !current)}
                    type="button"
                    variant="outline"
                  >
                    <User className="h-4 w-4" />
                    Профиль
                  </Button>
                  <Button aria-label="Выйти" variant="outline" onClick={logout}>
                    <LogOut className="h-4 w-4" />
                    Выйти
                  </Button>
                </>
              ) : (
                <Button onClick={() => void startLogin()} disabled={status === "checking" || status === "loggingOut"}>
                  {status === "checking" || status === "loggingOut" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="h-4 w-4" />
                  )}
                  Войти
                </Button>
              )}
            </div>
          </header>
        )}

        {roomSession ? (
          <LiveLessonExperience onLeave={leaveScheduledLessonRoom} profile={profile} session={roomSession} />
        ) : (
          <div className="grid flex-1 gap-5">
            {profileOpen ? (
              <ProfileAccountPanel
                adminLoading={adminLoading}
                adminMessage={adminMessage}
                adminUsers={adminUsers}
                appProfile={appProfile}
                error={error}
                isAdmin={isAdmin}
                isAuthenticated={isAuthenticated}
                onRefreshAdminUsers={() => void refreshAdminUsers()}
                onResetProfile={() => void resetProfile()}
                onSaveProfile={(input) => void saveProfile(input)}
                profile={profile}
                profileMessage={profileMessage}
                profileSaving={profileSaving}
                status={status}
              />
            ) : null}

            <SchedulePanel
              courses={courses}
              disabled={!isAuthenticated || scheduleLoading}
              lessons={courseLessons}
              loading={scheduleLoading}
              message={scheduleMessage}
              nowMs={nowMs}
              onCancel={(lesson) => void cancelScheduledLesson(lesson)}
              onCreate={(input) => void createScheduledLesson(input)}
              onDelete={(lessonId) => void deleteScheduledLesson(lessonId)}
              onJoin={(lesson) => void joinScheduledLesson(lesson)}
              onRefresh={() => void refreshSchedule()}
              profile={profile}
              roomLoadingLessonId={roomLoadingLessonId}
              roomMessage={roomMessage}
              scheduledLessons={scheduledLessons}
              studentUsers={studentUsers}
            />

            <CourseWorkspacePanel
              courses={courses}
              disabled={!isAuthenticated || courseLoading}
              lessons={courseLessons}
              loading={courseLoading}
              message={courseMessage}
              onCreateCourse={(input) => void createCourse(input)}
              onCreateLesson={(courseId, input) => void createLesson(courseId, input)}
              onDeleteCourse={(courseId) => void deleteCourse(courseId)}
              onDeleteLesson={(courseId, lessonId) => void deleteLesson(courseId, lessonId)}
              onRefresh={() => void refreshCourses()}
              profile={profile}
            />
          </div>
        )}
      </section>
    </main>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-16 w-16 place-items-center rounded-[1.1rem] bg-white text-center text-[1.35rem] font-black leading-[0.86] text-primary shadow-[0_16px_38px_rgba(255,92,0,0.14)] -rotate-3">
        Play
        <br />
        &Say
      </div>
      <div>
        <div className="text-sm font-black uppercase text-primary">Play&Say</div>
        <div className="text-xs font-bold text-muted-foreground">english studio</div>
      </div>
    </div>
  );
}

function ProfileAccountPanel({
  adminLoading,
  adminMessage,
  adminUsers,
  appProfile,
  error,
  isAdmin,
  isAuthenticated,
  onRefreshAdminUsers,
  onResetProfile,
  onSaveProfile,
  profile,
  profileMessage,
  profileSaving,
  status,
}: {
  adminLoading: boolean;
  adminMessage: string | null;
  adminUsers: AdminUserProfile[];
  appProfile: AppUserProfile | null;
  error: string | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  onRefreshAdminUsers: () => void;
  onResetProfile: () => void;
  onSaveProfile: (input: UpdateUserProfileInput) => void;
  profile: MeProfile | null;
  profileMessage: string | null;
  profileSaving: boolean;
  status: SessionStatus;
}) {
  return (
    <section className="rounded-[1.5rem] border border-border bg-white/90 p-5 shadow-[0_22px_70px_rgba(35,25,15,0.08)]">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-extrabold">Пользователь</h2>
          </div>
          <IdentityPanel error={error} profile={profile} status={status} />
        </section>

        <section className="min-w-0">
          <div className="mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-extrabold">Профиль Play&Say</h2>
          </div>
          <ProfileEditor
            disabled={!isAuthenticated || profileSaving}
            message={profileMessage}
            onReset={onResetProfile}
            onSave={onSaveProfile}
            profile={appProfile}
            saving={profileSaving}
          />
        </section>
      </div>

      {isAdmin ? (
        <div className="mt-5">
          <AdminUsersPanel
            loading={adminLoading}
            message={adminMessage}
            onRefresh={onRefreshAdminUsers}
            users={adminUsers}
          />
        </div>
      ) : null}
    </section>
  );
}

function CourseWorkspacePanel({
  courses,
  disabled,
  lessons,
  loading,
  message,
  onCreateCourse,
  onCreateLesson,
  onDeleteCourse,
  onDeleteLesson,
  onRefresh,
  profile,
}: {
  courses: Course[];
  disabled: boolean;
  lessons: CourseLessonMap;
  loading: boolean;
  message: string | null;
  onCreateCourse: (input: CourseInput) => void;
  onCreateLesson: (courseId: string, input: CourseLessonInput) => void;
  onDeleteCourse: (courseId: string) => void;
  onDeleteLesson: (courseId: string, lessonId: string) => void;
  onRefresh: () => void;
  profile: MeProfile | null;
}) {
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;

  return (
    <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">Курсы и уроки</h2>
        </div>
        <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Обновить
        </Button>
      </div>

      {!profile ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          Войдите, чтобы увидеть учебные программы.
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {canManage ? (
            <CourseCreateForm disabled={disabled} onCreate={onCreateCourse} />
          ) : null}

          {message ? (
            <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
              {message}
            </div>
          ) : null}

          {courses.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
              {canManage ? "Курсов пока нет. Создайте первую программу." : "Опубликованных курсов пока нет."}
            </div>
          ) : (
            <div className="grid gap-3">
              {courses.map((course) => (
                <CourseCard
                  canManage={canManage}
                  course={course}
                  disabled={disabled}
                  key={course.id}
                  lessons={lessons[course.id] ?? []}
                  onCreateLesson={(input) => onCreateLesson(course.id, input)}
                  onDeleteCourse={() => onDeleteCourse(course.id)}
                  onDeleteLesson={(lessonId) => onDeleteLesson(course.id, lessonId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CourseCreateForm({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: (input: CourseInput) => void;
}) {
  const [form, setForm] = useState<CourseFormState>({
    title: "",
    description: "",
    level: "A1",
    language: "en",
    isPublished: true,
  });

  function updateField<Key extends keyof CourseFormState>(field: Key, value: CourseFormState[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      title: form.title,
      description: form.description,
      level: form.level,
      language: form.language || "en",
      isPublished: form.isPublished,
    });
    setForm((current) => ({ ...current, title: "", description: "" }));
  }

  return (
    <form className="grid gap-3 rounded-2xl border border-border bg-muted/50 p-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_7rem]">
        <ProfileField label="Название курса">
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={160}
            onChange={(event) => updateField("title", event.target.value)}
            placeholder="English A1"
            required
            value={form.title}
          />
        </ProfileField>
        <ProfileField label="Уровень">
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={16}
            onChange={(event) => updateField("level", event.target.value)}
            value={form.level}
          />
        </ProfileField>
        <ProfileField label="Язык">
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={16}
            onChange={(event) => updateField("language", event.target.value)}
            value={form.language}
          />
        </ProfileField>
      </div>
      <ProfileField label="Описание">
        <textarea
          className="playsay-input min-h-20 resize-none py-3"
          disabled={disabled}
          maxLength={2_000}
          onChange={(event) => updateField("description", event.target.value)}
          placeholder="Короткое описание программы"
          value={form.description}
        />
      </ProfileField>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
          <input
            checked={form.isPublished}
            disabled={disabled}
            onChange={(event) => updateField("isPublished", event.target.checked)}
            type="checkbox"
          />
          Опубликован
        </label>
        <Button disabled={disabled || form.title.trim().length === 0} type="submit">
          <Plus className="h-4 w-4" />
          Создать курс
        </Button>
      </div>
    </form>
  );
}

function CourseCard({
  canManage,
  course,
  disabled,
  lessons,
  onCreateLesson,
  onDeleteCourse,
  onDeleteLesson,
}: {
  canManage: boolean;
  course: Course;
  disabled: boolean;
  lessons: CourseLesson[];
  onCreateLesson: (input: CourseLessonInput) => void;
  onDeleteCourse: () => void;
  onDeleteLesson: (lessonId: string) => void;
}) {
  return (
    <article className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-extrabold">{course.title}</h3>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
              {course.level ?? "level later"}
            </span>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
              {course.isPublished ? "published" : "draft"}
            </span>
          </div>
          {course.description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{course.description}</p>
          ) : null}
          <p className="mt-2 text-xs font-bold text-muted-foreground">
            {course.lessonCount} уроков · обновлено {new Date(course.updatedAt).toLocaleString()}
          </p>
        </div>
        {canManage ? (
          <Button disabled={disabled} onClick={onDeleteCourse} type="button" variant="outline">
            <Trash2 className="h-4 w-4" />
            Удалить
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2">
        {lessons.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/50 p-3 text-sm font-semibold text-muted-foreground">
            Уроки ещё не добавлены.
          </div>
        ) : (
          lessons.map((lesson) => (
            <CourseLessonRow
              canManage={canManage}
              disabled={disabled}
              key={lesson.id}
              lesson={lesson}
              onDelete={() => onDeleteLesson(lesson.id)}
            />
          ))
        )}
      </div>

      {canManage ? <CourseLessonCreateForm disabled={disabled} onCreate={onCreateLesson} /> : null}
    </article>
  );
}

function CourseLessonRow({
  canManage,
  disabled,
  lesson,
  onDelete,
}: {
  canManage: boolean;
  disabled: boolean;
  lesson: CourseLesson;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/45 p-3">
      <div>
        <div className="text-sm font-extrabold">{lesson.title}</div>
        <div className="mt-1 text-xs font-bold text-muted-foreground">
          № {lesson.orderIndex ?? "?"} · {formatDuration(lesson.plannedDurationMin)}
        </div>
      </div>
      {canManage ? (
        <Button disabled={disabled} onClick={onDelete} type="button" variant="outline">
          <Trash2 className="h-4 w-4" />
          Удалить
        </Button>
      ) : null}
    </div>
  );
}

function CourseLessonCreateForm({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: (input: CourseLessonInput) => void;
}) {
  const [form, setForm] = useState<LessonFormState>({
    title: "",
    orderIndex: "",
    plannedDurationMin: "45",
  });

  function updateField(field: keyof LessonFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      title: form.title,
      orderIndex: parseOptionalNumber(form.orderIndex),
      plannedDurationMin: parseOptionalNumber(form.plannedDurationMin),
    });
    setForm((current) => ({ ...current, title: "", orderIndex: "" }));
  }

  return (
    <form className="mt-3 grid gap-2 rounded-xl border border-border bg-muted/35 p-3 sm:grid-cols-[1fr_5rem_6rem_auto]" onSubmit={submit}>
      <input
        className="playsay-input"
        disabled={disabled}
        maxLength={160}
        onChange={(event) => updateField("title", event.target.value)}
        placeholder="Название урока"
        required
        value={form.title}
      />
      <input
        className="playsay-input"
        disabled={disabled}
        min={0}
        onChange={(event) => updateField("orderIndex", event.target.value)}
        placeholder="№"
        type="number"
        value={form.orderIndex}
      />
      <input
        className="playsay-input"
        disabled={disabled}
        max={480}
        min={1}
        onChange={(event) => updateField("plannedDurationMin", event.target.value)}
        placeholder="мин"
        type="number"
        value={form.plannedDurationMin}
      />
      <Button disabled={disabled || form.title.trim().length === 0} type="submit">
        <Plus className="h-4 w-4" />
        Урок
      </Button>
    </form>
  );
}

function SchedulePanel({
  courses,
  disabled,
  lessons,
  loading,
  message,
  nowMs,
  onCancel,
  onCreate,
  onDelete,
  onJoin,
  onRefresh,
  profile,
  roomLoadingLessonId,
  roomMessage,
  scheduledLessons,
  studentUsers,
}: {
  courses: Course[];
  disabled: boolean;
  lessons: CourseLessonMap;
  loading: boolean;
  message: string | null;
  nowMs: number;
  onCancel: (lesson: ScheduledLesson) => void;
  onCreate: (input: ScheduledLessonInput) => void;
  onDelete: (lessonId: string) => void;
  onJoin: (lesson: ScheduledLesson) => void;
  onRefresh: () => void;
  profile: MeProfile | null;
  roomLoadingLessonId: string | null;
  roomMessage: string | null;
  scheduledLessons: ScheduledLesson[];
  studentUsers: AdminUserProfile[];
}) {
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  const lessonOptions = flattenCourseLessonOptions(courses, lessons);
  const orderedLessons = [...scheduledLessons].sort((left, right) => compareScheduleLessons(left, right, nowMs));

  return (
    <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">Расписание</h2>
        </div>
        <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Обновить
        </Button>
      </div>

      {!profile ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          Войдите, чтобы увидеть расписание.
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {canManage ? (
            <ScheduleCreateForm
              disabled={disabled}
              lessonOptions={lessonOptions}
              onCreate={onCreate}
              studentUsers={studentUsers}
            />
          ) : null}

          {message ? (
            <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
              {message}
            </div>
          ) : null}

          {roomMessage ? (
            <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
              {roomMessage}
            </div>
          ) : null}

          {scheduledLessons.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
              {canManage ? "В расписании пока нет занятий." : "У вас пока нет запланированных занятий."}
            </div>
          ) : (
            <div className="grid gap-3">
              {orderedLessons.map((lesson) => (
                <ScheduledLessonCard
                  canManage={canManage}
                  disabled={disabled}
                  key={lesson.id}
                  lesson={lesson}
                  nowMs={nowMs}
                  onCancel={() => onCancel(lesson)}
                  onDelete={() => onDelete(lesson.id)}
                  onJoin={() => onJoin(lesson)}
                  roomLoading={roomLoadingLessonId === lesson.id}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ScheduleCreateForm({
  disabled,
  lessonOptions,
  onCreate,
  studentUsers,
}: {
  disabled: boolean;
  lessonOptions: Array<{ id: string; label: string }>;
  onCreate: (input: ScheduledLessonInput) => void;
  studentUsers: AdminUserProfile[];
}) {
  const [form, setForm] = useState<ScheduleFormState>(() => defaultScheduleForm(lessonOptions[0]?.id ?? ""));

  useEffect(() => {
    setForm((current) => (
      current.lessonTemplateId || lessonOptions.length === 0
        ? current
        : { ...current, lessonTemplateId: lessonOptions[0].id }
    ));
  }, [lessonOptions]);

  function updateField<Key extends keyof ScheduleFormState>(field: Key, value: ScheduleFormState[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleParticipant(subject: string) {
    setForm((current) => {
      const selected = selectedParticipantSubjects(current.participantSubjects);
      const next = selected.includes(subject)
        ? selected.filter((item) => item !== subject)
        : [...selected, subject];
      return { ...current, participantSubjects: next.join(", ") };
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      lessonTemplateId: form.lessonTemplateId || null,
      scheduledStart: localDateTimeToIso(form.scheduledStart),
      scheduledEnd: localDateTimeToIso(form.scheduledEnd),
      status: "SCHEDULED",
      type: form.type,
      participantSubjects: form.participantSubjects
        .split(",")
        .map((subject) => subject.trim())
        .filter(Boolean),
    });
  }

  return (
    <form className="grid gap-3 rounded-2xl border border-border bg-muted/50 p-3" onSubmit={submit}>
      <ProfileField label="Урок курса">
        <select
          className="playsay-input"
          disabled={disabled}
          onChange={(event) => updateField("lessonTemplateId", event.target.value)}
          value={form.lessonTemplateId}
        >
          <option value="">Без шаблона</option>
          {lessonOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </ProfileField>

      <div className="grid gap-3 sm:grid-cols-2">
        <ProfileField label="Начало">
          <input
            className="playsay-input"
            disabled={disabled}
            onChange={(event) => updateField("scheduledStart", event.target.value)}
            required
            type="datetime-local"
            value={form.scheduledStart}
          />
        </ProfileField>
        <ProfileField label="Конец">
          <input
            className="playsay-input"
            disabled={disabled}
            onChange={(event) => updateField("scheduledEnd", event.target.value)}
            required
            type="datetime-local"
            value={form.scheduledEnd}
          />
        </ProfileField>
      </div>

      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <ProfileField label="Формат">
          <select
            className="playsay-input"
            disabled={disabled}
            onChange={(event) => updateField("type", event.target.value as ScheduleFormState["type"])}
            value={form.type}
          >
            <option value="GROUP">Группа</option>
            <option value="INDIVIDUAL">Индивидуально</option>
          </select>
        </ProfileField>
        <ProfileField label="Ученики">
          {studentUsers.length === 0 ? (
            <input
              className="playsay-input"
              disabled={disabled}
              onChange={(event) => updateField("participantSubjects", event.target.value)}
              placeholder="Ученики появятся после первого входа"
              value={form.participantSubjects}
            />
          ) : (
            <div className="grid gap-2 rounded-2xl border border-border bg-background p-3">
              {studentUsers.map((student) => {
                const selected = selectedParticipantSubjects(form.participantSubjects).includes(student.subject);
                return (
                  <label className="flex items-center justify-between gap-3 text-sm font-extrabold" key={student.subject}>
                    <span className="min-w-0 truncate">
                      {student.displayName ?? student.name ?? student.username ?? student.subject}
                    </span>
                    <input
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggleParticipant(student.subject)}
                      type="checkbox"
                    />
                  </label>
                );
              })}
            </div>
          )}
        </ProfileField>
      </div>

      <div className="flex justify-end">
        <Button disabled={disabled} type="submit">
          <Plus className="h-4 w-4" />
          Добавить занятие
        </Button>
      </div>
    </form>
  );
}

function ScheduledLessonCard({
  canManage,
  disabled,
  lesson,
  nowMs,
  onCancel,
  onDelete,
  onJoin,
  roomLoading,
}: {
  canManage: boolean;
  disabled: boolean;
  lesson: ScheduledLesson;
  nowMs: number;
  onCancel: () => void;
  onDelete: () => void;
  onJoin: () => void;
  roomLoading: boolean;
}) {
  const joinable = isJoinableScheduledLesson(lesson, nowMs);
  const stateLabel = scheduleStateLabel(lesson, nowMs);

  return (
    <article className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-extrabold">
              {lesson.lessonTitle ?? lesson.courseTitle ?? "Занятие"}
            </h3>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
              {stateLabel}
            </span>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-extrabold text-muted-foreground">
              {formatLessonType(lesson.type)}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            {formatDateTime(lesson.scheduledStart)} — {formatDateTime(lesson.scheduledEnd)}
          </p>
          <p className="mt-1 text-xs font-bold text-muted-foreground">
            {lesson.courseTitle ?? "Курс позже"} · {lesson.teacherName ?? "Преподаватель позже"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {lesson.participants.length === 0 ? (
              <span className="rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-extrabold text-muted-foreground">
                ученики позже
              </span>
            ) : (
              lesson.participants.map((participant) => (
                <span
                  className="rounded-full border border-primary/20 bg-white px-3 py-1 text-xs font-extrabold text-primary"
                  key={participant.subject}
                >
                  {participant.displayName ?? participant.username ?? participant.subject}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={disabled || roomLoading || !joinable}
            onClick={onJoin}
            type="button"
          >
            {roomLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            Войти в урок
          </Button>
          {canManage ? (
            <>
            <Button disabled={disabled || lesson.status === "CANCELLED"} onClick={onCancel} type="button" variant="outline">
              <RotateCcw className="h-4 w-4" />
              Отменить
            </Button>
            <Button disabled={disabled} onClick={onDelete} type="button" variant="outline">
              <Trash2 className="h-4 w-4" />
              Удалить
            </Button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function LiveLessonExperience({
  onLeave,
  profile,
  session,
}: {
  onLeave: () => void;
  profile: MeProfile | null;
  session: LessonRoomSession;
}) {
  const displayName = profile?.name ?? profile?.username ?? "Участник";
  const roleLabel = profile?.roles[0] ?? "STUDENT";
  const lessonTypeLabel = formatLessonType(session.lessonType);

  return (
    <div className="playsay-classroom-shell">
      <section className="playsay-video-rail">
        <div className="playsay-video-header">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold text-primary-foreground">
                <Radio className="h-3.5 w-3.5" />
                В эфире
              </span>
              <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs font-extrabold text-white/80">
                {lessonTypeLabel}
              </span>
            </div>
            <h1 className="mt-2 truncate text-2xl font-black tracking-normal">{session.lessonTitle}</h1>
            <p className="mt-1 truncate text-sm font-semibold text-white/60">
              {session.courseTitle ?? "Play&Say"} · {formatLessonRange(session.lessonStartsAt, session.lessonEndsAt)}
            </p>
          </div>
          <Button className="playsay-lesson-exit" onClick={onLeave} type="button" variant="outline">
            <PhoneOff className="h-4 w-4" />
            Выйти
          </Button>
        </div>

        <div className="playsay-classroom-room min-h-0 flex-1">
          <LiveKitRoom
            audio
            connect
            data-lk-theme="default"
            serverUrl={session.serverUrl}
            token={session.token}
            video
          >
            <ClassroomVideoStage />
          </LiveKitRoom>
        </div>
      </section>

      <LessonWorkspace displayName={displayName} profile={profile} roleLabel={roleLabel} session={session} />
    </div>
  );
}

function ClassroomVideoStage() {
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);
  const singlePipInitializedRef = useRef(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ offsetX: number; offsetY: number; pointerId: number } | null>(null);
  const [pipPosition, setPipPosition] = useState({ x: 12, y: 120 });
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const orderedTracks = [...tracks].sort((left, right) => Number(left.participant.isLocal) - Number(right.participant.isLocal));
  const featuredTrack = orderedTracks[0];
  const stripTracks = orderedTracks.slice(1);
  const hasStrip = stripTracks.length > 0;
  const stripLayout = stripTracks.length > 1 ? "row" : "single";
  const canDragStrip = hasStrip && stripLayout === "single";
  const pipStyle = {
    "--playsay-pip-x": `${pipPosition.x}px`,
    "--playsay-pip-y": `${pipPosition.y}px`,
  } as CSSProperties;

  function clampPipPosition(x: number, y: number) {
    const focusRect = focusRef.current?.getBoundingClientRect();
    const stripRect = stripRef.current?.getBoundingClientRect();

    if (!focusRect || !stripRect) {
      return { x, y };
    }

    const inset = 8;
    const maxX = Math.max(inset, focusRect.width - stripRect.width - inset);
    let maxY = Math.max(inset, focusRect.height - stripRect.height - inset);
    const controlsRect = controlsRef.current?.getBoundingClientRect();

    if (controlsRect && controlsRect.top < focusRect.bottom && controlsRect.bottom > focusRect.top) {
      maxY = Math.min(maxY, Math.max(inset, controlsRect.top - focusRect.top - stripRect.height - inset));
    }

    return {
      x: Math.min(Math.max(x, inset), maxX),
      y: Math.min(Math.max(y, inset), maxY),
    };
  }

  function getDefaultSinglePipPosition() {
    const focusRect = focusRef.current?.getBoundingClientRect();
    const stripRect = stripRef.current?.getBoundingClientRect();
    const inset = 8;

    if (!focusRect || !stripRect) {
      return pipPosition;
    }

    return clampPipPosition(inset, focusRect.height - stripRect.height - inset);
  }

  function getPipPositionFromPointer(event: PointerEvent<HTMLDivElement>) {
    const focusRect = focusRef.current?.getBoundingClientRect();
    const currentDrag = dragState.current;

    if (!focusRect || !currentDrag) {
      return pipPosition;
    }

    return clampPipPosition(
      event.clientX - focusRect.left - currentDrag.offsetX,
      event.clientY - focusRect.top - currentDrag.offsetY,
    );
  }

  function handlePipPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!canDragStrip || !stripRef.current) {
      return;
    }

    const stripRect = stripRef.current.getBoundingClientRect();
    dragState.current = {
      offsetX: event.clientX - stripRect.left,
      offsetY: event.clientY - stripRect.top,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setPipPosition(getPipPositionFromPointer(event));
  }

  function handlePipPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    setPipPosition(getPipPositionFromPointer(event));
  }

  function handlePipPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragState.current = null;
  }

  useEffect(() => {
    if (!hasStrip) {
      singlePipInitializedRef.current = false;
      return undefined;
    }

    if (stripLayout === "row") {
      dragState.current = null;
      singlePipInitializedRef.current = false;
      return undefined;
    }

    function keepPipInBounds() {
      setPipPosition((current) => {
        const next = singlePipInitializedRef.current ? current : getDefaultSinglePipPosition();
        singlePipInitializedRef.current = true;
        return clampPipPosition(next.x, next.y);
      });
    }

    const animationFrame = window.requestAnimationFrame(keepPipInBounds);
    window.addEventListener("resize", keepPipInBounds);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", keepPipInBounds);
    };
  }, [hasStrip, stripLayout, stripTracks.length]);

  return (
    <div className="playsay-classroom-conference" data-layout={stripLayout}>
      <div className="playsay-video-focus" ref={focusRef}>
        {featuredTrack ? <ParticipantTile trackRef={featuredTrack} /> : null}
        <div
          className="playsay-video-strip"
          data-draggable={canDragStrip ? "true" : "false"}
          data-empty={hasStrip ? "false" : "true"}
          data-layout={stripLayout}
          onPointerCancel={handlePipPointerEnd}
          onPointerDown={handlePipPointerDown}
          onPointerMove={handlePipPointerMove}
          onPointerUp={handlePipPointerEnd}
          ref={stripRef}
          style={pipStyle}
        >
          {hasStrip ? (
            <TrackLoop tracks={stripTracks}>
              <ParticipantTile />
            </TrackLoop>
          ) : null}
        </div>
      </div>
      <div className="lk-control-bar playsay-classroom-controls" ref={controlsRef}>
        <TrackToggle source={Track.Source.Microphone}>Микрофон</TrackToggle>
        <TrackToggle source={Track.Source.Camera}>Камера</TrackToggle>
        <StartMediaButton label="Включить медиа" />
      </div>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}

function LessonWorkspace({
  displayName,
  profile,
  roleLabel,
  session,
}: {
  displayName: string;
  profile: MeProfile | null;
  roleLabel: string;
  session: LessonRoomSession;
}) {
  return (
    <section className="playsay-workbench">
      <header className="playsay-workbench-topbar">
        <nav className="playsay-lesson-tabs" aria-label="Разделы урока">
          <button className="playsay-lesson-tab" data-active="true" type="button">
            Урок
          </button>
          <button className="playsay-lesson-tab" type="button">
            <Paperclip className="h-4 w-4" />
            Вложения
          </button>
        </nav>

        <div className="playsay-lesson-statusline">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-4 w-4 text-primary" />
            {formatLessonRange(session.lessonStartsAt, session.lessonEndsAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" />
            {formatParticipantCount(session.participants.length)}
          </span>
        </div>
      </header>

      <div className="playsay-workbench-body">
        <div className="playsay-material-header">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#dff8ee] px-2.5 py-1 text-xs font-black text-[#167953]">
                {roleLabel}
              </span>
              <span className="rounded-full border border-border bg-white px-2.5 py-1 text-xs font-extrabold text-muted-foreground">
                {displayName}
              </span>
            </div>
            <h2 className="mt-2 truncate text-2xl font-black tracking-normal">{session.lessonTitle}</h2>
            <p className="mt-1 truncate text-sm font-semibold text-muted-foreground">
              {session.courseTitle ?? "Play&Say"} · {session.roomName}
            </p>
          </div>
          {canAssignLessons(profile) ? (
            <Button disabled type="button" variant="outline">
              <Plus className="h-4 w-4" />
              Назначить
            </Button>
          ) : null}
        </div>

        <div className="playsay-assignment-strip" aria-label="Назначенные задания">
          <AssignmentStub active title="Speaking warm-up" tag="Speaking" />
          <AssignmentStub title="Favourite game" tag="Writing" />
          <AssignmentStub title="Mini dialogue" tag="Grammar" />
        </div>

        <LessonTaskCanvas teacherName={session.teacherName ?? displayName} />
      </div>
    </section>
  );
}

function LessonTaskCanvas({ teacherName }: { teacherName: string }) {
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("pointer");
  const [annotationColor, setAnnotationColor] = useState("#ff5c00");
  const [annotationStrokes, setAnnotationStrokes] = useState<AnnotationStroke[]>([]);
  const activeStrokeId = useRef<string | null>(null);

  function beginAnnotation(event: PointerEvent<SVGSVGElement>) {
    if (annotationTool === "pointer") {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = svgPointFromEvent(event);
    if (annotationTool === "eraser") {
      eraseAnnotationAt(point, setAnnotationStrokes);
      return;
    }

    const id = `stroke-${Date.now()}-${Math.round(point.x)}-${Math.round(point.y)}`;
    activeStrokeId.current = id;
    setAnnotationStrokes((current) => [...current, { color: annotationColor, id, points: [point] }]);
  }

  function extendAnnotation(event: PointerEvent<SVGSVGElement>) {
    if (annotationTool === "pointer") {
      return;
    }

    event.preventDefault();
    const point = svgPointFromEvent(event);
    if (annotationTool === "eraser") {
      eraseAnnotationAt(point, setAnnotationStrokes);
      return;
    }

    const id = activeStrokeId.current;
    if (!id) {
      return;
    }

    setAnnotationStrokes((current) =>
      current.map((stroke) => (stroke.id === id ? { ...stroke, points: [...stroke.points, point] } : stroke)),
    );
  }

  function endAnnotation(event: PointerEvent<SVGSVGElement>) {
    if (activeStrokeId.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be gone after browser-level cancellation.
      }
    }
    activeStrokeId.current = null;
  }

  return (
    <div className="playsay-task-board">
      <aside className="playsay-annotation-toolbar" aria-label="Инструменты задания">
        <AnnotationToolButton active={annotationTool === "pointer"} label="Курсор" onClick={() => setAnnotationTool("pointer")}>
          <MousePointer2 className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "pen"} label="Карандаш" onClick={() => setAnnotationTool("pen")}>
          <PenLine className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton active={annotationTool === "eraser"} label="Ластик" onClick={() => setAnnotationTool("eraser")}>
          <Eraser className="h-4 w-4" />
        </AnnotationToolButton>
        <AnnotationToolButton
          active={false}
          disabled={annotationStrokes.length === 0}
          label="Отменить"
          onClick={() => setAnnotationStrokes((current) => current.slice(0, -1))}
        >
          <Undo2 className="h-4 w-4" />
        </AnnotationToolButton>
        <div className="playsay-color-swatches" aria-label="Цвет">
          {["#ff5c00", "#00a878", "#2574ff"].map((color) => (
            <button
              aria-label={color}
              className="playsay-color-swatch"
              data-active={annotationColor === color ? "true" : "false"}
              key={color}
              onClick={() => setAnnotationColor(color)}
              style={{ backgroundColor: color }}
              type="button"
            />
          ))}
        </div>
      </aside>

      <div className="playsay-task-page">
        <div className="playsay-task-document">
          <div className="playsay-task-kicker">
            <FileText className="h-4 w-4 text-primary" />
            2. Let's chat
          </div>
          <h3>Make a guess and complete the descriptions below the pictures</h3>
          <p className="playsay-task-subtitle">The importance of food for travellers</p>

          <div className="playsay-task-cards">
            <TaskPictureCard caption="Travellers who think food is important" tone="mint" />
            <TaskPictureCard caption="Travellers who think food is not important" tone="yellow" />
          </div>

          <div className="playsay-fill-exercise">
            <label>
              I am in the
              <input aria-label="gap 1" defaultValue="" />
            </label>
            <label>
              I see a lot of
              <input aria-label="gap 2" defaultValue="" />
              around.
            </label>
            <label>
              I feel
              <input aria-label="gap 3" defaultValue="" />
              because the trip is exciting.
            </label>
          </div>
        </div>

        <svg
          className="playsay-annotation-layer"
          data-tool={annotationTool}
          onPointerCancel={endAnnotation}
          onPointerDown={beginAnnotation}
          onPointerMove={extendAnnotation}
          onPointerUp={endAnnotation}
          viewBox="0 0 1000 700"
        >
          {annotationStrokes.map((stroke) => (
            <path
              d={pointsToSvgPath(stroke.points)}
              fill="none"
              key={stroke.id}
              stroke={stroke.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="8"
            />
          ))}
        </svg>
      </div>

      <footer className="playsay-task-footer">
        <button aria-label="Предыдущее задание" className="playsay-page-button" type="button">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>1 из 14</span>
        <button aria-label="Следующее задание" className="playsay-page-button" type="button">
          <ChevronRight className="h-4 w-4" />
        </button>
        <Button disabled type="button">
          <Send className="h-4 w-4" />
          Отправить
        </Button>
        <span className="playsay-task-teacher">{teacherName}</span>
      </footer>
    </div>
  );
}

function AssignmentStub({
  active = false,
  tag,
  title,
}: {
  active?: boolean;
  tag: string;
  title: string;
}) {
  return (
    <article className="playsay-assignment-card" data-active={active ? "true" : "false"}>
      <div className="text-sm font-extrabold text-foreground">{title}</div>
      <div className="mt-2 inline-flex rounded-full border border-primary/15 bg-white px-2 py-1 text-xs font-extrabold text-primary">
        {tag}
      </div>
    </article>
  );
}

function TaskPictureCard({
  caption,
  tone,
}: {
  caption: string;
  tone: "mint" | "yellow";
}) {
  const toneClass = tone === "mint" ? "playsay-picture-card-mint" : "playsay-picture-card-yellow";

  return (
    <figure className={`playsay-picture-card ${toneClass}`}>
      <div className="playsay-picture-illustration">
        <div className="playsay-picture-face" />
        <div className="playsay-picture-plate" />
        <div className="playsay-picture-tower" />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function AnnotationToolButton({
  active,
  children,
  disabled = false,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="playsay-annotation-button"
      data-active={active ? "true" : "false"}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function ProfileEditor({
  disabled,
  message,
  onReset,
  onSave,
  profile,
  saving,
}: {
  disabled: boolean;
  message: string | null;
  onReset: () => void;
  onSave: (input: UpdateUserProfileInput) => void;
  profile: AppUserProfile | null;
  saving: boolean;
}) {
  const [form, setForm] = useState<ProfileFormState>({
    displayName: "",
    locale: "",
    timezone: "",
    learningGoal: "",
  });

  useEffect(() => {
    setForm({
      displayName: profile?.displayName ?? "",
      locale: profile?.locale ?? "",
      timezone: profile?.timezone ?? "",
      learningGoal: profile?.learningGoal ?? "",
    });
  }, [profile]);

  function updateField(field: keyof ProfileFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      displayName: form.displayName,
      locale: form.locale,
      timezone: form.timezone,
      learningGoal: form.learningGoal,
    });
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <ProfileField label="Имя">
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={120}
            onChange={(event) => updateField("displayName", event.target.value)}
            value={form.displayName}
          />
        </ProfileField>
        <ProfileField label="Язык">
          <input
            className="playsay-input"
            disabled={disabled}
            maxLength={16}
            onChange={(event) => updateField("locale", event.target.value)}
            placeholder="en"
            value={form.locale}
          />
        </ProfileField>
      </div>

      <ProfileField label="Часовой пояс">
        <input
          className="playsay-input"
          disabled={disabled}
          maxLength={64}
          onChange={(event) => updateField("timezone", event.target.value)}
          placeholder="Europe/Moscow"
          value={form.timezone}
        />
      </ProfileField>

      <ProfileField label="Цель обучения">
        <textarea
          className="playsay-input min-h-24 resize-none py-3"
          disabled={disabled}
          maxLength={500}
          onChange={(event) => updateField("learningGoal", event.target.value)}
          value={form.learningGoal}
        />
      </ProfileField>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="text-xs font-semibold text-muted-foreground">
          {message ?? (profile ? `Обновлено ${new Date(profile.updatedAt).toLocaleString()}` : "Войдите, чтобы редактировать")}
        </div>
        <div className="flex gap-2">
          <Button disabled={disabled || !profile} onClick={onReset} type="button" variant="outline">
            <RotateCcw className="h-4 w-4" />
            Сбросить
          </Button>
          <Button disabled={disabled} type="submit">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Сохранить
          </Button>
        </div>
      </div>
    </form>
  );
}

function ProfileField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid gap-1 text-xs font-extrabold text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function IdentityPanel({
  error,
  profile,
  status,
}: {
  error: string | null;
  profile: MeProfile | null;
  status: SessionStatus;
}) {
  if (status === "checking") {
    return (
      <div className="mt-4 flex min-h-28 items-center gap-3 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Проверяем сессию
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mt-4 flex min-h-28 items-center gap-3 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-primary" />
        {error ?? "Ошибка сессии"}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mt-4 flex min-h-28 items-center gap-3 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
        <User className="h-4 w-4 text-primary" />
        Войдите, чтобы открыть кабинет
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold">{profile.name ?? profile.username ?? profile.subject}</div>
          <div className="mt-1 break-all text-xs font-semibold text-muted-foreground">{profile.email ?? profile.subject}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {profile.roles.map((role) => (
          <span className="rounded-full border border-primary/20 bg-white px-3 py-1 text-xs font-extrabold text-primary" key={role}>
            {role}
          </span>
        ))}
      </div>
    </div>
  );
}

function AdminUsersPanel({
  loading,
  message,
  onRefresh,
  users,
}: {
  loading: boolean;
  message: string | null;
  onRefresh: () => void;
  users: AdminUserProfile[];
}) {
  return (
    <section className="rounded-[1.5rem] border border-border bg-white/90 p-5 shadow-[0_22px_70px_rgba(35,25,15,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">Admin users</h2>
        </div>
        <Button disabled={loading} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Обновить
        </Button>
      </div>

      {message ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
          {message}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {users.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
            Известных app-профилей пока нет.
          </div>
        ) : (
          users.map((user) => <AdminUserRow key={user.subject} user={user} />)
        )}
      </div>
    </section>
  );
}

function AdminUserRow({ user }: { user: AdminUserProfile }) {
  return (
    <article className="rounded-2xl border border-border bg-muted/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold">
            {user.displayName ?? user.name ?? user.username ?? user.subject}
          </div>
          <div className="mt-1 break-all text-xs font-semibold text-muted-foreground">
            {user.email ?? user.username ?? user.subject}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-extrabold text-primary">
          {user.roles[0] ?? "NO_ROLE"}
        </span>
      </div>
      {user.learningGoal ? (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{user.learningGoal}</p>
      ) : null}
    </article>
  );
}

async function fetchCourseBundle(): Promise<{ courses: Course[]; lessons: CourseLessonMap }> {
  const courses = await fetchCourses();
  const lessonEntries = await Promise.all(
    courses.map(async (course) => [course.id, await fetchCourseLessons(course.id)] as const),
  );

  return {
    courses,
    lessons: Object.fromEntries(lessonEntries),
  };
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDuration(value: number | null | undefined): string {
  return value ? `${value} мин` : "длительность позже";
}

function flattenCourseLessonOptions(
  courses: Course[],
  lessons: CourseLessonMap,
): Array<{ id: string; label: string }> {
  return courses.flatMap((course) =>
    (lessons[course.id] ?? []).map((lesson) => ({
      id: lesson.id,
      label: `${course.title} · ${lesson.orderIndex ?? "?"}. ${lesson.title}`,
    })),
  );
}

function defaultScheduleForm(lessonTemplateId: string): ScheduleFormState {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 45);

  return {
    lessonTemplateId,
    scheduledStart: toDateTimeLocalValue(start),
    scheduledEnd: toDateTimeLocalValue(end),
    type: "GROUP",
    participantSubjects: "",
  };
}

function toDateTimeLocalValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "время позже";
}

function isClosedScheduleStatus(status: string): boolean {
  return status === "CANCELLED" || status === "COMPLETED";
}

function dateValueMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function isScheduleExpired(lesson: ScheduledLesson, nowMs = Date.now()): boolean {
  const endMs = dateValueMs(lesson.scheduledEnd);
  return endMs !== null && endMs <= nowMs;
}

function isLessonCurrent(lesson: ScheduledLesson, nowMs: number): boolean {
  const startMs = dateValueMs(lesson.scheduledStart);
  const endMs = dateValueMs(lesson.scheduledEnd);
  return (startMs === null || startMs <= nowMs) && (endMs === null || endMs > nowMs);
}

function isJoinableScheduledLesson(lesson: ScheduledLesson, nowMs = Date.now()): boolean {
  return !isClosedScheduleStatus(lesson.status) && !isScheduleExpired(lesson, nowMs);
}

function scheduleStateLabel(lesson: ScheduledLesson, nowMs: number): string {
  if (lesson.status === "CANCELLED") {
    return "Отменён";
  }

  if (lesson.status === "COMPLETED" || isScheduleExpired(lesson, nowMs)) {
    return "Истёк";
  }

  if (lesson.status === "IN_PROGRESS" || isLessonCurrent(lesson, nowMs)) {
    return "В эфире";
  }

  return "Запланирован";
}

function scheduleSortRank(lesson: ScheduledLesson, nowMs: number): number {
  if (!isJoinableScheduledLesson(lesson, nowMs)) {
    return 3;
  }

  if (lesson.status === "IN_PROGRESS" || isLessonCurrent(lesson, nowMs)) {
    return 0;
  }

  return dateValueMs(lesson.scheduledStart) === null ? 2 : 1;
}

function compareScheduleLessons(left: ScheduledLesson, right: ScheduledLesson, nowMs: number): number {
  const rankDiff = scheduleSortRank(left, nowMs) - scheduleSortRank(right, nowMs);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  const leftStart = dateValueMs(left.scheduledStart) ?? Number.MAX_SAFE_INTEGER;
  const rightStart = dateValueMs(right.scheduledStart) ?? Number.MAX_SAFE_INTEGER;
  if (leftStart !== rightStart) {
    return leftStart - rightStart;
  }

  return (left.lessonTitle ?? left.courseTitle ?? left.id).localeCompare(right.lessonTitle ?? right.courseTitle ?? right.id);
}

function compareJoinableLessons(left: ScheduledLesson, right: ScheduledLesson, nowMs: number): number {
  return compareScheduleLessons(left, right, nowMs);
}

function formatLessonRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) {
    return "время позже";
  }

  if (!start) {
    return `до ${formatDateTime(end)}`;
  }

  if (!end) {
    return `с ${formatDateTime(start)}`;
  }

  return `${formatDateTime(start)} - ${new Date(end).toLocaleTimeString()}`;
}

function formatLessonType(value: string): string {
  return value === "INDIVIDUAL" ? "Индивидуально" : "Группа";
}

function svgPointFromEvent(event: PointerEvent<SVGSVGElement>): AnnotationPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 1000,
    y: ((event.clientY - rect.top) / rect.height) * 700,
  };
}

function eraseAnnotationAt(
  point: AnnotationPoint,
  setStrokes: (updater: (current: AnnotationStroke[]) => AnnotationStroke[]) => void,
) {
  setStrokes((current) => current.filter((stroke) => distanceToStroke(point, stroke) > 34));
}

function distanceToStroke(point: AnnotationPoint, stroke: AnnotationStroke): number {
  return stroke.points.reduce((nearest, strokePoint) => {
    const distance = Math.hypot(point.x - strokePoint.x, point.y - strokePoint.y);
    return Math.min(nearest, distance);
  }, Number.POSITIVE_INFINITY);
}

function pointsToSvgPath(points: AnnotationPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  const [firstPoint, ...rest] = points;
  return rest.reduce(
    (path, point) => `${path} L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    `M ${firstPoint.x.toFixed(1)} ${firstPoint.y.toFixed(1)}`,
  );
}

function canAssignLessons(profile: MeProfile | null): boolean {
  return profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
}

function formatParticipantCount(value: number): string {
  if (value === 0) {
    return "ученики позже";
  }

  if (value === 1) {
    return "1 ученик";
  }

  if (value > 1 && value < 5) {
    return `${value} ученика`;
  }

  return `${value} учеников`;
}

function selectedParticipantSubjects(value: string): string[] {
  return value
    .split(",")
    .map((subject) => subject.trim())
    .filter(Boolean);
}

function classroomPath(lessonId: string): string {
  return `/lessons/${lessonId}/classroom`;
}

function classroomLessonIdFromPath(pathname: string): string | null {
  const match = /^\/lessons\/([^/]+)\/classroom\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}
