import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  ConnectionStateToast,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  StartMediaButton,
  TrackToggle,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  AlertCircle,
  Archive,
  BookOpen,
  Bot,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Copy,
  Eraser,
  Eye,
  FileText,
  Globe2,
  ImageIcon,
  Layers3,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  LockKeyhole,
  MousePointer2,
  Paperclip,
  PenLine,
  PhoneOff,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  ScreenShare,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  User,
  Users,
  Video,
  Wand2,
} from "lucide-react";
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
  fetchMaterialAssets,
  fetchMaterials,
  fetchMe,
  fetchScheduledLessons,
  fetchScheduledLessonMaterialAnnotation,
  fetchScheduledLessonMaterial,
  fetchScheduledLessonMaterialSubmission,
  fetchScheduledLessonMaterialSubmissions,
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
  saveScheduledLessonMaterialAnnotation,
  saveMaterial,
  saveScheduledLessonMaterialSubmission,
  saveScheduledLesson,
  saveUserProfile,
  startLogin,
  type AdminUserProfile,
  type AppUserProfile,
  type Course,
  type CourseInput,
  type CourseLesson,
  type CourseLessonInput,
  type LessonMaterial,
  type LessonMaterialAsset,
  type LessonMaterialDraft,
  type LessonMaterialGenerateImagesInput,
  type LessonMaterialDraftInput,
  type LessonMaterialInput,
  type LessonMaterialJson,
  type LessonMaterialUrlDraftInput,
  type LessonMaterialSubmission,
  type LiveKitRoomToken,
  type MeProfile,
  type ScheduledLesson,
  type ScheduledLessonInput,
  type UpdateUserProfileInput,
} from "./auth";
import { Button } from "./components/ui/button";

type SessionStatus = "checking" | "anonymous" | "authenticated" | "loggingOut" | "error";

type LessonRealtimeMessage = {
  type?: string;
  lesson?: ScheduledLesson;
  lessonId?: string;
  message?: string;
};

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
  lessonId: string;
  lessonEndsAt: string | null;
  lessonTemplateId: string | null;
  lessonStartsAt: string | null;
  lessonStatus: string;
  lessonTitle: string;
  lessonType: string;
  materialId: string | null;
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

type ClassroomTrackReference = ReturnType<typeof useTracks>[number];
type ClassroomStripLayout = "single" | "row";
type ClassroomVideoMode = "lesson" | "videoOnly";
type WorkspaceTab = "schedule" | "materials" | "courses";

type MaterialBlockType =
  | "text"
  | "image"
  | "videoEmbed"
  | "flashcards"
  | "fillGaps"
  | "multipleChoice"
  | "matchingPairs"
  | "freeWriting"
  | "speakingPrompt"
  | "drawingArea"
  | "generatedImage";

type MaterialMatchingPair = {
  id: string;
  left: string;
  right: string;
  imagePrompt?: string;
  imageAlt?: string;
  imageUrl?: string;
};

type MaterialAssessmentPolicy = {
  weight?: number;
  maxAttempts?: number;
  attemptPenalty?: number;
  hintPenalty?: number;
  lockAfterAttempts?: boolean;
};

type MaterialAttemptEntry = {
  at: string;
  correct?: boolean;
  value: string;
};

type MaterialHintEntry = {
  at: string;
  label: string;
  penalty: number;
  type: string;
  value?: string;
};

type MaterialAnswerStatus = {
  attemptsUsed: number;
  correct: boolean;
  icon: typeof CheckCircle2;
  incorrectAttempts: number;
  hintsUsed: number;
  kind: "empty" | "draft" | "correct" | "retry" | "hint" | "wrong" | "locked";
  label: string;
  locked: boolean;
  maxAttempts: number;
};

type MaterialEditorBlock = {
  id: string;
  type: MaterialBlockType;
  title: string;
  assessment?: MaterialAssessmentPolicy;
  body?: string;
  prompt?: string;
  url?: string;
  provider?: string;
  caption?: string;
  cards?: Array<{ id: string; front: string; back: string; example?: string }>;
  items?: Array<{ prompt: string; answer?: string; options?: string[]; weight?: number }>;
  pairs?: MaterialMatchingPair[];
  height?: number;
};

const MAX_MANUAL_INPUT_HINTS = 3;
const emptyMaterialMatchingPairs: MaterialMatchingPair[] = [];

type MaterialExerciseItem = NonNullable<MaterialEditorBlock["items"]>[number];

type MaterialEditorPage = {
  id: string;
  title: string;
  layout: "FLOW" | "WORKSHEET";
  blocks: MaterialEditorBlock[];
};

type MaterialEditorDocument = {
  schemaVersion: 1;
  pages: MaterialEditorPage[];
};

type MaterialRenderMode = "classroom" | "teacherPreview";
type MaterialAnswerBlock = Record<string, unknown>;
type MaterialAnswerState = Record<string, MaterialAnswerBlock>;

type MaterialFormState = {
  id: string | null;
  title: string;
  description: string;
  language: string;
  cefrLevel: string;
  visibility: "PRIVATE" | "PUBLIC";
  status: "DRAFT" | "PUBLISHED";
  sourcePrompt: string;
  document: MaterialEditorDocument;
  scoringRubric: LessonMaterialJson;
  sourceMeta: LessonMaterialJson;
};

type MaterialDraftSourceImage = {
  dataUrl: string;
  fileName: string;
  originalSize: number;
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
          <LiveLessonExperience
            materials={materials}
            onAssignMaterial={(lessonId, materialId) => assignMaterialToScheduledLesson(lessonId, materialId)}
            onLeave={leaveScheduledLessonRoom}
            profile={profile}
            session={roomSession}
          />
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

            {workspaceTabs.length > 1 ? (
              <WorkspaceTabs activeTab={workspaceTab} onSelect={setWorkspaceTab} tabs={workspaceTabs} />
            ) : null}

            {workspaceTab === "schedule" ? (
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
            ) : null}

            {workspaceTab === "materials" ? (
              <MaterialLibraryPanel
                courses={courses}
                disabled={!isAuthenticated || materialLoading}
                lessons={courseLessons}
                loading={materialLoading}
                materials={materials}
                message={materialMessage}
                onArchive={(materialId) => void deleteMaterial(materialId)}
                onDraft={(input) => generateMaterialDraft(input)}
                onDraftFromUrl={(input) => generateMaterialDraftFromUrl(input)}
                onGenerateImages={(materialId, input) => generateImagesForMaterial(materialId, input)}
                onLinkLesson={(courseId, lesson, materialId) => void linkMaterialToCourseLesson(courseId, lesson, materialId)}
                onRefresh={() => void refreshMaterials()}
                onSave={(input, materialId) => upsertMaterial(input, materialId)}
                profile={profile}
              />
            ) : null}

            {workspaceTab === "courses" ? (
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
            ) : null}
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

function WorkspaceTabs({
  activeTab,
  onSelect,
  tabs,
}: {
  activeTab: WorkspaceTab;
  onSelect: (tab: WorkspaceTab) => void;
  tabs: Array<{ id: WorkspaceTab; label: string; description: string }>;
}) {
  return (
    <nav className="playsay-workspace-tabs" aria-label="Рабочие разделы">
      {tabs.map((tab) => (
        <button
          className="playsay-workspace-tab"
          data-active={activeTab === tab.id ? "true" : "false"}
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          type="button"
        >
          {workspaceTabIcon(tab.id)}
          <span>
            <strong>{tab.label}</strong>
            <small>{tab.description}</small>
          </span>
        </button>
      ))}
    </nav>
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

function MaterialLibraryPanel({
  courses,
  disabled,
  lessons,
  loading,
  materials,
  message,
  onArchive,
  onDraft,
  onDraftFromUrl,
  onGenerateImages,
  onLinkLesson,
  onRefresh,
  onSave,
  profile,
}: {
  courses: Course[];
  disabled: boolean;
  lessons: CourseLessonMap;
  loading: boolean;
  materials: LessonMaterial[];
  message: string | null;
  onArchive: (materialId: string) => void;
  onDraft: (input: LessonMaterialDraftInput) => Promise<LessonMaterialDraft | null>;
  onDraftFromUrl: (input: LessonMaterialUrlDraftInput) => Promise<LessonMaterialDraft | null>;
  onGenerateImages: (materialId: string, input: LessonMaterialGenerateImagesInput) => Promise<LessonMaterial | null>;
  onLinkLesson: (courseId: string, lesson: CourseLesson, materialId: string | null) => void;
  onRefresh: () => void;
  onSave: (input: LessonMaterialInput, materialId?: string) => Promise<LessonMaterial | null>;
  profile: MeProfile | null;
}) {
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  const lessonOptions = flattenCourseLessonMaterialOptions(courses, lessons);
  const [form, setForm] = useState<MaterialFormState>(() => defaultMaterialForm());
  const [autoSelectedMaterialId, setAutoSelectedMaterialId] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftImage, setDraftImage] = useState<MaterialDraftSourceImage | null>(null);
  const [draftImageMessage, setDraftImageMessage] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedLessonKey, setSelectedLessonKey] = useState("");
  const canGenerateDraft = draftPrompt.trim().length > 0 || draftImage !== null;
  const canGenerateUrlDraft = draftUrl.trim().length > 0;
  const canGenerateImages = hasMissingMatchingPairImages(form.document);

  useEffect(() => {
    if (selectedLessonKey || lessonOptions.length === 0) {
      return;
    }
    setSelectedLessonKey(lessonOptions[0].key);
  }, [lessonOptions, selectedLessonKey]);

  useEffect(() => {
    const firstMaterial = materials[0];
    if (!firstMaterial || autoSelectedMaterialId === firstMaterial.id || form.id || form.title.trim()) {
      return;
    }

    setForm(materialToForm(firstMaterial));
    setDraftPrompt(readPromptFromSourceMeta(firstMaterial.sourceMeta));
    setDraftUrl(readUrlFromSourceMeta(firstMaterial.sourceMeta));
    setAutoSelectedMaterialId(firstMaterial.id);
  }, [autoSelectedMaterialId, form.id, form.title, materials]);

  function updateForm<Key extends keyof MaterialFormState>(field: Key, value: MaterialFormState[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setForm(defaultMaterialForm());
    setDraftPrompt("");
    setDraftUrl("");
    setDraftImage(null);
    setDraftImageMessage(null);
  }

  function selectMaterial(material: LessonMaterial) {
    setForm(materialToForm(material));
    setDraftPrompt(readPromptFromSourceMeta(material.sourceMeta));
    setDraftUrl(readUrlFromSourceMeta(material.sourceMeta));
    setDraftImage(null);
    setDraftImageMessage(null);
  }

  function addBlock(type: MaterialBlockType) {
    setForm((current) => ({
      ...current,
      document: {
        ...current.document,
        pages: current.document.pages.map((page, index) => (
          index === 0
            ? { ...page, blocks: [...page.blocks, newMaterialBlock(type)] }
            : page
        )),
      },
    }));
  }

  function updateBlock(blockId: string, patch: Partial<MaterialEditorBlock>) {
    setForm((current) => ({
      ...current,
      document: {
        ...current.document,
        pages: current.document.pages.map((page) => ({
          ...page,
          blocks: page.blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
        })),
      },
    }));
  }

  function removeBlock(blockId: string) {
    setForm((current) => ({
      ...current,
      document: {
        ...current.document,
        pages: current.document.pages.map((page) => ({
          ...page,
          blocks: page.blocks.filter((block) => block.id !== blockId),
        })),
      },
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSave(materialFormToInput(form), form.id ?? undefined);
    if (saved) {
      setForm(materialToForm(saved));
    }
  }

  async function generateDraft() {
    const prompt = draftPrompt.trim() || "Создай редактируемый материал Play&Say по приложенному скану или фото задания.";
    const draft = await onDraft({
      title: form.title || null,
      prompt,
      language: form.language,
      cefrLevel: form.cefrLevel,
      sourceImageDataUrl: draftImage?.dataUrl ?? null,
      sourceFileName: draftImage?.fileName ?? null,
    });
    if (draft) {
      setForm(materialDraftToForm(draft));
      setDraftPrompt(readPromptFromSourceMeta(draft.sourceMeta) || prompt);
    }
  }

  async function generateDraftFromUrl() {
    const url = draftUrl.trim();
    if (!url) {
      return;
    }
    const draft = await onDraftFromUrl({
      url,
      title: form.title || null,
      prompt: draftPrompt.trim() || null,
      language: form.language,
      cefrLevel: form.cefrLevel,
    });
    if (draft) {
      setForm(materialDraftToForm(draft));
      setDraftPrompt(readPromptFromSourceMeta(draft.sourceMeta));
      setDraftUrl(readUrlFromSourceMeta(draft.sourceMeta) || url);
    }
  }

  async function handleDraftImageChange(file: File | null) {
    setDraftImageMessage(null);
    if (!file) {
      return;
    }

    try {
      const image = await prepareMaterialDraftSourceImage(file);
      setDraftImage(image);
      if (draftPrompt.trim().length === 0) {
        setDraftPrompt("Создай редактируемый материал Play&Say по приложенному скану: выдели упражнения, ответы и добавь speaking follow-up.");
      }
    } catch (caught) {
      setDraftImage(null);
      setDraftImageMessage(caught instanceof Error ? caught.message : "Не удалось подготовить изображение.");
    }
  }

  function linkSelectedLesson() {
    const option = lessonOptions.find((item) => item.key === selectedLessonKey);
    if (!option) {
      return;
    }
    onLinkLesson(option.courseId, option.lesson, form.id);
  }

  function duplicateCurrentMaterial() {
    setForm((current) => duplicateMaterialForm(current));
  }

  async function generateCurrentImages() {
    const saved = await onSave(materialFormToInput(form), form.id ?? undefined);
    if (!saved) {
      return;
    }
    setForm(materialToForm(saved));
    const generated = await onGenerateImages(saved.id, { maxImages: 12 });
    if (generated) {
      setForm(materialToForm(generated));
    }
  }

  if (!profile) {
    return (
      <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">Материалы</h2>
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          Войдите, чтобы создавать и открывать материалы уроков.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold">Материалы</h2>
        </div>
        <Button disabled={disabled} onClick={onRefresh} type="button" variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Обновить
        </Button>
      </div>

      {!canManage ? (
        <div className="mt-4 rounded-2xl border border-border bg-muted/70 p-4 text-sm font-semibold text-muted-foreground">
          Сейчас ученику доступны опубликованные материалы только внутри назначенного урока.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)]">
          <aside className="grid content-start gap-3">
            <div className="rounded-2xl border border-border bg-muted/45 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-extrabold">Библиотека</div>
                <Button disabled={disabled} onClick={resetForm} type="button" variant="outline">
                  <Plus className="h-4 w-4" />
                  Новый
                </Button>
              </div>
              {materials.length === 0 ? (
                <div className="rounded-xl border border-border bg-white p-3 text-sm font-semibold text-muted-foreground">
                  Материалов пока нет.
                </div>
              ) : (
                <div className="grid max-h-[30rem] gap-2 overflow-auto pr-1">
                  {materials.map((material) => (
                    <button
                      className="playsay-material-list-item"
                      data-active={form.id === material.id ? "true" : "false"}
                      key={material.id}
                      onClick={() => selectMaterial(material)}
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-extrabold">{material.title}</span>
                        <span className="mt-1 flex flex-wrap gap-1.5 text-[0.68rem] font-black uppercase text-muted-foreground">
                          <span>{material.cefrLevel}</span>
                          <span>{material.status}</span>
                          <span>{material.visibility}</span>
                          <span>{material.blockCount} blocks</span>
                        </span>
                      </span>
                      {material.visibility === "PUBLIC" ? (
                        <Globe2 className="h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-white p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-extrabold">
                <Wand2 className="h-4 w-4 text-primary" />
                Черновик с AI
              </div>
              <textarea
                className="playsay-input min-h-28 resize-none py-3"
                disabled={disabled}
                maxLength={4_000}
                onChange={(event) => setDraftPrompt(event.target.value)}
                placeholder="Например: A2, travelling, 45 минут, warm-up, слова, speaking и короткое письмо"
                value={draftPrompt}
              />
              <label className="mt-2 block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase text-muted-foreground">
                  <Globe2 className="h-3.5 w-3.5 text-primary" />
                  Внешняя страница
                </span>
                <input
                  className="playsay-input"
                  disabled={disabled}
                  maxLength={2_000}
                  onChange={(event) => setDraftUrl(event.target.value)}
                  placeholder="https://..."
                  type="url"
                  value={draftUrl}
                />
              </label>
              <label className="mt-2 block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5 text-primary" />
                  Фото или скан
                </span>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="playsay-file-input"
                  disabled={disabled}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null;
                    event.currentTarget.value = "";
                    void handleDraftImageChange(file);
                  }}
                  type="file"
                />
              </label>
              {draftImage ? (
                <div className="playsay-draft-image-preview">
                  <img alt="" src={draftImage.dataUrl} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold">{draftImage.fileName}</div>
                    <div className="text-xs font-bold text-muted-foreground">
                      {formatFileSize(draftImage.originalSize)} · подготовлено для AI
                    </div>
                  </div>
                  <Button disabled={disabled} onClick={() => setDraftImage(null)} type="button" variant="outline">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
              {draftImageMessage ? (
                <div className="mt-2 rounded-xl border border-border bg-muted/60 p-2 text-xs font-bold text-muted-foreground">
                  {draftImageMessage}
                </div>
              ) : null}
              <Button
                className="mt-2 w-full"
                disabled={disabled || !canGenerateDraft}
                onClick={() => void generateDraft()}
                type="button"
              >
                <Sparkles className="h-4 w-4" />
                Подготовить черновик
              </Button>
              <Button
                className="mt-2 w-full"
                disabled={disabled || !canGenerateUrlDraft}
                onClick={() => void generateDraftFromUrl()}
                type="button"
                variant="outline"
              >
                <Globe2 className="h-4 w-4" />
                Черновик из ссылки
              </Button>
            </div>

            <div className="rounded-2xl border border-border bg-white p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-extrabold">
                <Link2 className="h-4 w-4 text-primary" />
                Привязка к уроку
              </div>
              <select
                className="playsay-input"
                disabled={disabled || lessonOptions.length === 0}
                onChange={(event) => setSelectedLessonKey(event.target.value)}
                value={selectedLessonKey}
              >
                {lessonOptions.length === 0 ? (
                  <option value="">Создайте урок курса</option>
                ) : (
                  lessonOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button disabled={disabled || !form.id || !selectedLessonKey} onClick={linkSelectedLesson} type="button">
                  <Link2 className="h-4 w-4" />
                  Привязать
                </Button>
                <Button
                  disabled={disabled || !selectedLessonKey}
                  onClick={() => {
                    const option = lessonOptions.find((item) => item.key === selectedLessonKey);
                    if (option) {
                      onLinkLesson(option.courseId, option.lesson, null);
                    }
                  }}
                  type="button"
                  variant="outline"
                >
                  Снять
                </Button>
              </div>
            </div>
          </aside>

          <form className="grid gap-4" onSubmit={submit}>
            <div className="rounded-2xl border border-border bg-white p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem]">
                <ProfileField label="Название">
                  <input
                    className="playsay-input"
                    disabled={disabled}
                    maxLength={160}
                    onChange={(event) => updateForm("title", event.target.value)}
                    required
                    value={form.title}
                  />
                </ProfileField>
                <ProfileField label="Уровень">
                  <select
                    className="playsay-input"
                    disabled={disabled}
                    onChange={(event) => updateForm("cefrLevel", event.target.value)}
                    value={form.cefrLevel}
                  >
                    {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </ProfileField>
                <ProfileField label="Доступ">
                  <select
                    className="playsay-input"
                    disabled={disabled}
                    onChange={(event) => updateForm("visibility", event.target.value as MaterialFormState["visibility"])}
                    value={form.visibility}
                  >
                    <option value="PRIVATE">Приватный</option>
                    <option value="PUBLIC">Публичный</option>
                  </select>
                </ProfileField>
                <ProfileField label="Статус">
                  <select
                    className="playsay-input"
                    disabled={disabled}
                    onChange={(event) => updateForm("status", event.target.value as MaterialFormState["status"])}
                    value={form.status}
                  >
                    <option value="DRAFT">Черновик</option>
                    <option value="PUBLISHED">Опубликован</option>
                  </select>
                </ProfileField>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[8rem_minmax(0,1fr)]">
                <ProfileField label="Язык">
                  <input
                    className="playsay-input"
                    disabled={disabled}
                    maxLength={16}
                    onChange={(event) => updateForm("language", event.target.value)}
                    value={form.language}
                  />
                </ProfileField>
                <ProfileField label="Описание">
                  <input
                    className="playsay-input"
                    disabled={disabled}
                    maxLength={2_000}
                    onChange={(event) => updateForm("description", event.target.value)}
                    placeholder="Короткая заметка для себя"
                    value={form.description}
                  />
                </ProfileField>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {(["text", "videoEmbed", "image", "generatedImage", "flashcards", "fillGaps", "multipleChoice", "matchingPairs", "freeWriting", "speakingPrompt", "drawingArea"] as MaterialBlockType[]).map((type) => (
                    <Button disabled={disabled} key={type} onClick={() => addBlock(type)} type="button" variant="outline">
                      {materialBlockIcon(type)}
                      {materialBlockLabel(type)}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button disabled={disabled || form.title.trim().length === 0} onClick={duplicateCurrentMaterial} type="button" variant="outline">
                    <Copy className="h-4 w-4" />
                    Дублировать
                  </Button>
                  <Button disabled={disabled || form.title.trim().length === 0} onClick={() => setPreviewOpen((current) => !current)} type="button" variant="outline">
                    <Eye className="h-4 w-4" />
                    {previewOpen ? "Скрыть" : "Просмотр"}
                  </Button>
                  <Button disabled={disabled || !canGenerateImages || form.title.trim().length === 0} onClick={() => void generateCurrentImages()} type="button" variant="outline">
                    <Sparkles className="h-4 w-4" />
                    Картинки
                  </Button>
                  {form.id ? (
                    <Button disabled={disabled} onClick={() => onArchive(form.id!)} type="button" variant="outline">
                      <Archive className="h-4 w-4" />
                      Архив
                    </Button>
                  ) : null}
                  <Button disabled={disabled || form.title.trim().length === 0} type="submit">
                    <Save className="h-4 w-4" />
                    Сохранить
                  </Button>
                </div>
              </div>
            </div>

            <div className="playsay-material-editor">
              {form.document.pages[0]?.blocks.length === 0 ? (
                <div className="rounded-2xl border border-border bg-muted/60 p-4 text-sm font-semibold text-muted-foreground">
                  Добавьте первый блок материала.
                </div>
              ) : (
                form.document.pages[0]?.blocks.map((block, index) => (
                  <MaterialBlockEditor
                    block={block}
                    disabled={disabled}
                    index={index}
                    key={block.id}
                    onRemove={() => removeBlock(block.id)}
                    onUpdate={(patch) => updateBlock(block.id, patch)}
                  />
                ))
              )}
            </div>

            {previewOpen ? (
              <div className="playsay-material-preview">
                <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-muted-foreground">
                  <Eye className="h-4 w-4 text-primary" />
                  Предпросмотр
                </div>
                <LessonMaterialDocumentView material={materialPreviewFromForm(form)} mode="teacherPreview" />
              </div>
            ) : null}

            {message ? (
              <div className="rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
                {message}
              </div>
            ) : null}
          </form>
        </div>
      )}
    </section>
  );
}

function MaterialBlockEditor({
  block,
  disabled,
  index,
  onRemove,
  onUpdate,
}: {
  block: MaterialEditorBlock;
  disabled: boolean;
  index: number;
  onRemove: () => void;
  onUpdate: (patch: Partial<MaterialEditorBlock>) => void;
}) {
  return (
    <article className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-black text-muted-foreground">
              {index + 1}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3eb] px-2 py-1 text-xs font-black text-primary">
              {materialBlockIcon(block.type)}
              {materialBlockLabel(block.type)}
            </span>
          </div>
          <input
            className="mt-3 w-full border-0 bg-transparent p-0 text-lg font-black outline-none"
            disabled={disabled}
            maxLength={160}
            onChange={(event) => onUpdate({ title: event.target.value })}
            value={block.title}
          />
        </div>
        <Button disabled={disabled} onClick={onRemove} type="button" variant="outline">
          <Trash2 className="h-4 w-4" />
          Удалить
        </Button>
      </div>

      <div className="mt-3 grid gap-3">
        {block.type === "videoEmbed" ? (
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <ProfileField label="Платформа">
              <select
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => onUpdate({ provider: event.target.value })}
                value={block.provider ?? "YOUTUBE"}
              >
                <option value="YOUTUBE">YouTube</option>
                <option value="VK">VK</option>
                <option value="RUTUBE">Rutube</option>
              </select>
            </ProfileField>
            <ProfileField label="Ссылка">
              <input
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => onUpdate({ url: event.target.value })}
                placeholder="https://..."
                value={block.url ?? ""}
              />
            </ProfileField>
          </div>
        ) : null}

        {block.type === "image" || block.type === "generatedImage" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ProfileField label={block.type === "generatedImage" ? "Prompt" : "Ссылка на изображение"}>
              <input
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => onUpdate(block.type === "generatedImage" ? { prompt: event.target.value } : { url: event.target.value })}
                placeholder={block.type === "generatedImage" ? "friendly classroom picture" : "https://..."}
                value={block.type === "generatedImage" ? block.prompt ?? "" : block.url ?? ""}
              />
            </ProfileField>
            <ProfileField label="Подпись">
              <input
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => onUpdate({ caption: event.target.value })}
                value={block.caption ?? ""}
              />
            </ProfileField>
          </div>
        ) : null}

        {block.type === "flashcards" ? (
          <textarea
            className="playsay-input min-h-28 resize-none py-3"
            disabled={disabled}
            onChange={(event) => onUpdate({ cards: parseFlashcards(event.target.value) })}
            value={formatFlashcards(block.cards)}
          />
        ) : null}

        {block.type === "fillGaps" || block.type === "multipleChoice" ? (
          <textarea
            className="playsay-input min-h-28 resize-none py-3"
            disabled={disabled}
            onChange={(event) => onUpdate({ items: parseExerciseItems(event.target.value, block.type as "fillGaps" | "multipleChoice") })}
            value={formatExerciseItems(block.items, block.type as "fillGaps" | "multipleChoice")}
          />
        ) : null}

        {block.type === "matchingPairs" ? (
          <textarea
            className="playsay-input min-h-36 resize-none py-3"
            disabled={disabled}
            onChange={(event) => onUpdate({ pairs: parseMatchingPairs(event.target.value) })}
            value={formatMatchingPairs(block.pairs)}
          />
        ) : null}

        {isObjectiveMaterialBlockType(block.type) ? (
          <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-4">
            <ProfileField label="Вес">
              <input
                className="playsay-input"
                disabled={disabled}
                min={0.1}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, weight: Number(event.target.value) } })}
                step={0.1}
                type="number"
                value={block.assessment?.weight ?? 1}
              />
            </ProfileField>
            <ProfileField label="Попытки">
              <input
                className="playsay-input"
                disabled={disabled}
                min={1}
                max={10}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, maxAttempts: Number(event.target.value) } })}
                type="number"
                value={block.assessment?.maxAttempts ?? 3}
              />
            </ProfileField>
            <ProfileField label="Штраф за попытку">
              <input
                className="playsay-input"
                disabled={disabled}
                min={0}
                max={1}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, attemptPenalty: Number(event.target.value) } })}
                step={0.05}
                type="number"
                value={block.assessment?.attemptPenalty ?? 0.3}
              />
            </ProfileField>
            <ProfileField label="Штраф за hint">
              <input
                className="playsay-input"
                disabled={disabled}
                min={0}
                max={1}
                onChange={(event) => onUpdate({ assessment: { ...defaultObjectiveAssessmentPolicy(), ...block.assessment, hintPenalty: Number(event.target.value) } })}
                step={0.05}
                type="number"
                value={block.assessment?.hintPenalty ?? 0.15}
              />
            </ProfileField>
          </div>
        ) : null}

        {block.type === "text" || block.type === "freeWriting" || block.type === "speakingPrompt" ? (
          <textarea
            className="playsay-input min-h-28 resize-none py-3"
            disabled={disabled}
            onChange={(event) => onUpdate(block.type === "text" ? { body: event.target.value } : { prompt: event.target.value })}
            value={block.type === "text" ? block.body ?? "" : block.prompt ?? ""}
          />
        ) : null}

        {block.type === "drawingArea" ? (
          <ProfileField label="Высота области">
            <input
              className="playsay-input"
              disabled={disabled}
              max={800}
              min={120}
              onChange={(event) => onUpdate({ height: Number(event.target.value) })}
              type="number"
              value={block.height ?? 240}
            />
          </ProfileField>
        ) : null}
      </div>
    </article>
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
        {lesson.materialTitle ? (
          <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-[#fff3eb] px-2 py-1 text-xs font-extrabold text-primary">
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{lesson.materialTitle}</span>
          </div>
        ) : null}
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
      materialId: null,
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
          {lesson.materialTitle ? (
            <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-[#fff3eb] px-2.5 py-1 text-xs font-extrabold text-primary">
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{lesson.materialTitle}</span>
            </p>
          ) : null}
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
  materials,
  onAssignMaterial,
  onLeave,
  profile,
  session,
}: {
  materials: LessonMaterial[];
  onAssignMaterial: (lessonId: string, materialId: string | null) => Promise<ScheduledLesson | null>;
  onLeave: () => void;
  profile: MeProfile | null;
  session: LessonRoomSession;
}) {
  const displayName = profile?.name ?? profile?.username ?? "Участник";
  const lessonTypeLabel = formatLessonType(session.lessonType);
  const canManageLesson = canAssignLessons(profile);
  const videoOnly = !session.materialId && !canManageLesson;

  return (
    <div className="playsay-classroom-shell" data-video-only={videoOnly ? "true" : "false"}>
      <section className="playsay-video-rail">
        <div className="playsay-video-header">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold text-primary-foreground">
                <Radio className="h-3.5 w-3.5" />
                В эфире
              </span>
              <span className="playsay-video-type-badge rounded-full border border-white/15 px-2.5 py-1 text-xs font-extrabold text-white/80">
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
            <ClassroomVideoStage mode={videoOnly ? "videoOnly" : "lesson"} />
          </LiveKitRoom>
        </div>
      </section>

      {videoOnly ? null : (
        <LessonWorkspace
          displayName={displayName}
          materials={materials}
          onAssignMaterial={onAssignMaterial}
          profile={profile}
          session={session}
        />
      )}
    </div>
  );
}

function ClassroomVideoStage({ mode }: { mode: ClassroomVideoMode }) {
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);
  const singlePipInitializedRef = useRef(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ offsetX: number; offsetY: number; pointerId: number } | null>(null);
  const [pipPosition, setPipPosition] = useState({ x: 12, y: 120 });
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const screenShareTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const orderedCameraTracks = [...cameraTracks].sort((left, right) => Number(left.participant.isLocal) - Number(right.participant.isLocal));
  const remoteScreenShareTrack = screenShareTracks.find((trackRef) => !trackRef.participant.isLocal);
  const featuredTrack = remoteScreenShareTrack ?? orderedCameraTracks[0];
  const stripTracks = remoteScreenShareTrack ? orderedCameraTracks : orderedCameraTracks.slice(1);
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
    const inset = 22;

    if (!focusRect || !stripRect) {
      return pipPosition;
    }

    const isCompactVideo = focusRect.width <= 640;
    const xInset = isCompactVideo ? 58 : inset;
    const yInset = isCompactVideo ? 48 : inset;

    return clampPipPosition(xInset, focusRect.height - stripRect.height - yInset);
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
    if (mode === "videoOnly") {
      singlePipInitializedRef.current = false;
      return undefined;
    }

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
  }, [hasStrip, mode, stripLayout, stripTracks.length]);

  if (mode === "videoOnly" && !remoteScreenShareTrack) {
    return (
      <div className="playsay-classroom-conference" data-layout="grid" data-mode="video-only">
        <div className="playsay-video-grid" data-count={orderedCameraTracks.length || 1}>
          {orderedCameraTracks.length > 0
            ? orderedCameraTracks.map((trackRef) => (
              <ClassroomGridVideoTile key={classroomTrackKey(trackRef)} trackRef={trackRef} />
            ))
            : (
              <div className="playsay-video-grid-empty">
                <Video className="h-6 w-6" />
                <span>Участники появятся здесь</span>
              </div>
            )}
        </div>
        <ClassroomControlBar setControlsRef={(node) => { controlsRef.current = node; }} />
        <RoomAudioRenderer />
        <ConnectionStateToast />
      </div>
    );
  }

  return (
    <div className="playsay-classroom-conference" data-layout={stripLayout} data-screen-share={remoteScreenShareTrack ? "true" : "false"}>
      <div className="playsay-video-focus" ref={focusRef}>
        {featuredTrack ? <ParticipantTile trackRef={featuredTrack} /> : null}
        {remoteScreenShareTrack ? (
          <div className="playsay-screen-share-label">
            <ScreenShare className="h-4 w-4" />
            {participantDisplayName(remoteScreenShareTrack)}
          </div>
        ) : null}
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
          {hasStrip
            ? stripTracks.map((trackRef) => (
              <ClassroomMiniVideoTile
                key={classroomTrackKey(trackRef)}
                layout={stripLayout}
                trackRef={trackRef}
              />
            ))
            : null}
        </div>
      </div>
      <ClassroomControlBar setControlsRef={(node) => { controlsRef.current = node; }} />
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}

function ClassroomControlBar({ setControlsRef }: { setControlsRef: (node: HTMLDivElement | null) => void }) {
  return (
    <div className="lk-control-bar playsay-classroom-controls" ref={setControlsRef}>
      <TrackToggle source={Track.Source.Microphone}>Микрофон</TrackToggle>
      <TrackToggle source={Track.Source.Camera}>Камера</TrackToggle>
      <TrackToggle source={Track.Source.ScreenShare}>
        <ScreenShare className="h-4 w-4" />
        Экран
      </TrackToggle>
      <StartMediaButton label="Включить медиа" />
    </div>
  );
}

function ClassroomGridVideoTile({ trackRef }: { trackRef: ClassroomTrackReference }) {
  const label = participantDisplayName(trackRef);

  return (
    <div className="playsay-video-grid-card">
      <ParticipantTile trackRef={trackRef} />
      <div className="playsay-video-card-label" title={label}>
        {label}
      </div>
    </div>
  );
}

function ClassroomMiniVideoTile({
  layout,
  trackRef,
}: {
  layout: ClassroomStripLayout;
  trackRef: ClassroomTrackReference;
}) {
  const label = participantDisplayName(trackRef);

  return (
    <div className="playsay-video-card" data-layout={layout}>
      <ParticipantTile trackRef={trackRef} />
      <div className="playsay-video-card-label" title={label}>
        {label}
      </div>
    </div>
  );
}

function LessonWorkspace({
  displayName,
  materials,
  onAssignMaterial,
  profile,
  session,
}: {
  displayName: string;
  materials: LessonMaterial[];
  onAssignMaterial: (lessonId: string, materialId: string | null) => Promise<ScheduledLesson | null>;
  profile: MeProfile | null;
  session: LessonRoomSession;
}) {
  const [material, setMaterial] = useState<LessonMaterial | null>(null);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState(session.materialId ?? "");
  const [assigningMaterial, setAssigningMaterial] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [submission, setSubmission] = useState<LessonMaterialSubmission | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [submissionSaving, setSubmissionSaving] = useState(false);
  const [submissionSnapshots, setSubmissionSnapshots] = useState<LessonMaterialSubmission[]>([]);
  const [submissionMonitorError, setSubmissionMonitorError] = useState<string | null>(null);
  const canMonitorSubmissions = canAssignLessons(profile);
  const canManageMaterial = canAssignLessons(profile);
  const selectableMaterials = materials.filter((item) => item.status !== "ARCHIVED");
  const lessonScore = canMonitorSubmissions ? averageSubmissionScore(submissionSnapshots) : submission?.score ?? null;

  useEffect(() => {
    setSelectedMaterialId(session.materialId ?? "");
  }, [session.materialId]);

  useEffect(() => {
    if (assignmentMessage !== "Материал назначен" && assignmentMessage !== "Материал снят") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setAssignmentMessage(null), 2_500);
    return () => window.clearTimeout(timeoutId);
  }, [assignmentMessage]);

  useEffect(() => {
    if (!session.materialId) {
      setMaterial(null);
      setMaterialError(null);
      setMaterialLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function loadMaterial() {
      setMaterialLoading(true);
      setMaterialError(null);
      try {
        const lessonMaterial = await fetchScheduledLessonMaterial(session.lessonId);
        if (!cancelled) {
          setMaterial(lessonMaterial);
        }
      } catch (caught) {
        if (!cancelled) {
          setMaterial(null);
          setMaterialError(caught instanceof Error ? caught.message : "Не удалось загрузить материал");
        }
      } finally {
        if (!cancelled) {
          setMaterialLoading(false);
        }
      }
    }

    void loadMaterial();
    return () => {
      cancelled = true;
    };
  }, [session.lessonId, session.materialId]);

  useEffect(() => {
    if (!session.materialId) {
      setSubmission(null);
      setSubmissionMessage(null);
      return undefined;
    }

    let cancelled = false;

    async function loadSubmission() {
      try {
        const savedSubmission = await fetchScheduledLessonMaterialSubmission(session.lessonId);
        if (!cancelled) {
          setSubmission(savedSubmission);
        }
      } catch (caught) {
        if (!cancelled) {
          setSubmission(null);
          setSubmissionMessage(caught instanceof Error ? caught.message : "Не удалось загрузить ответы");
        }
      }
    }

    void loadSubmission();
    return () => {
      cancelled = true;
    };
  }, [session.lessonId, session.materialId]);

  useEffect(() => {
    if (!canMonitorSubmissions || !material?.id) {
      setSubmissionSnapshots([]);
      setSubmissionMonitorError(null);
      return undefined;
    }

    let cancelled = false;

    async function loadSubmissionSnapshots() {
      try {
        const snapshots = await fetchScheduledLessonMaterialSubmissions(session.lessonId);
        if (!cancelled) {
          setSubmissionSnapshots(snapshots);
          setSubmissionMonitorError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setSubmissionSnapshots([]);
          setSubmissionMonitorError(caught instanceof Error ? caught.message : "Не удалось загрузить ответы учеников");
        }
      }
    }

    void loadSubmissionSnapshots();
    const intervalId = window.setInterval(() => {
      void loadSubmissionSnapshots();
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [canMonitorSubmissions, material?.id, session.lessonId]);

  async function saveMaterialAnswers(content: LessonMaterialJson) {
    setSubmissionSaving(true);
    setSubmissionMessage(null);
    try {
      const savedSubmission = await saveScheduledLessonMaterialSubmission(session.lessonId, {
        content,
        submitted: true,
      });
      setSubmission(savedSubmission);
      setSubmissionMessage("Ответ отправлен");
    } catch (caught) {
      setSubmissionMessage(caught instanceof Error ? caught.message : "Не удалось отправить ответ");
    } finally {
      setSubmissionSaving(false);
    }
  }

  async function assignMaterial() {
    setAssigningMaterial(true);
    setAssignmentMessage(null);
    try {
      const updated = await onAssignMaterial(session.lessonId, selectedMaterialId || null);
      if (!updated) {
        setAssignmentMessage("Материал не назначен");
        return;
      }

      if (!updated.materialId) {
        setMaterial(null);
        setMaterialError(null);
        setAssignmentMessage("Материал снят");
        return;
      }

      const lessonMaterial = await fetchScheduledLessonMaterial(session.lessonId);
      setMaterial(lessonMaterial);
      setMaterialError(null);
      setAssignmentMessage("Материал назначен");
    } catch (caught) {
      setAssignmentMessage(caught instanceof Error ? caught.message : "Не удалось назначить материал");
    } finally {
      setAssigningMaterial(false);
    }
  }

  return (
    <section className="playsay-workbench">
      <header className="playsay-workbench-topbar">
        <nav className="playsay-lesson-tabs" aria-label="Разделы урока">
          <button className="playsay-lesson-tab" data-active="true" type="button">
            Урок
          </button>
        </nav>

        <div className="playsay-workbench-tools">
          {canManageMaterial ? (
            <div className="playsay-lesson-material-picker">
              <select
                className="playsay-input"
                disabled={assigningMaterial || selectableMaterials.length === 0}
                onChange={(event) => setSelectedMaterialId(event.target.value)}
                value={selectedMaterialId}
              >
                <option value="">Материал не выбран</option>
                {selectableMaterials.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <Button
                disabled={assigningMaterial || selectedMaterialId === (session.materialId ?? "")}
                onClick={() => void assignMaterial()}
                type="button"
                variant="outline"
              >
                {assigningMaterial ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Назначить
              </Button>
            </div>
          ) : null}
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
        </div>
      </header>

      <div className="playsay-workbench-body">

        {assignmentMessage ? (
          <div className="playsay-lesson-inline-message">
            {assignmentMessage}
          </div>
        ) : null}

        {material ? (
          <div className="playsay-assignment-strip" aria-label="Назначенные задания">
            {materialDocumentBlocks(material).slice(0, 6).map((block, index) => (
              <AssignmentStub
                active={index === 0}
                key={block.id}
                tag={materialBlockLabel(block.type)}
                title={block.title}
              />
            ))}
          </div>
        ) : (
          <div className="playsay-assignment-strip" aria-label="Назначенные задания">
            <AssignmentStub active title="Материал не назначен" tag="Урок" />
          </div>
        )}

        {canMonitorSubmissions && material ? (
          <MaterialSubmissionsMonitor error={submissionMonitorError} submissions={submissionSnapshots} />
        ) : null}

        {materialLoading ? (
          <div className="playsay-task-board playsay-material-loading">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>Материал загружается</span>
          </div>
        ) : material ? (
          <LessonTaskCanvas
            lessonId={session.lessonId}
            material={material}
            onSaveAnswers={(content) => void saveMaterialAnswers(content)}
            score={lessonScore}
            submission={submission}
            submissionMessage={submissionMessage}
            submissionSaving={submissionSaving}
            teacherName={session.teacherName ?? displayName}
          />
        ) : canManageMaterial ? (
          <div className="playsay-task-board playsay-material-loading">
            <BookOpen className="h-5 w-5 text-primary" />
            <span>Выберите материал для урока</span>
          </div>
        ) : (
          <>
            {materialError ? (
              <div className="mb-2 rounded-2xl border border-border bg-muted/70 p-3 text-sm font-semibold text-muted-foreground">
                {materialError}
              </div>
            ) : null}
            <LessonTaskCanvas
              lessonId={session.lessonId}
              onSaveAnswers={(content) => void saveMaterialAnswers(content)}
              score={lessonScore}
              submission={submission}
              submissionMessage={submissionMessage}
              submissionSaving={submissionSaving}
              teacherName={session.teacherName ?? displayName}
            />
          </>
        )}
      </div>
    </section>
  );
}

function MaterialSubmissionsMonitor({
  error,
  submissions,
}: {
  error: string | null;
  submissions: LessonMaterialSubmission[];
}) {
  const latestSubmissions = submissions.slice(0, 4);

  return (
    <section className="playsay-submission-monitor" aria-label="Ответы учеников">
      <div className="playsay-submission-monitor-summary">
        <span>Ответы учеников</span>
        <strong>{submissions.length}</strong>
      </div>
      <div className="playsay-submission-monitor-list">
        {error ? (
          <span className="playsay-submission-monitor-error">
            <AlertCircle className="h-3.5 w-3.5" />
            Ошибка загрузки
          </span>
        ) : latestSubmissions.length === 0 ? (
          <span className="playsay-submission-monitor-empty">пока нет ответов</span>
        ) : (
          latestSubmissions.map((submission) => {
            const assessment = materialSubmissionAssessmentSummary(submission);
            return (
              <span className="playsay-submission-pill" key={submission.id} title={`${materialSubmissionUserLabel(submission)} · ${assessment.label}`}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{materialSubmissionUserLabel(submission)}</span>
                {typeof submission.score === "number" ? <strong>{formatMaterialScore(submission.score)}</strong> : null}
                {assessment.hints > 0 ? <small>{assessment.hints} hint</small> : null}
                {assessment.retries > 0 ? <small>{assessment.retries} retry</small> : null}
                <time dateTime={submission.submittedAt ?? submission.updatedAt}>
                  {formatSubmissionTime(submission.submittedAt ?? submission.updatedAt)}
                </time>
              </span>
            );
          })
        )}
      </div>
    </section>
  );
}

function LessonTaskCanvas({
  lessonId,
  material,
  onSaveAnswers,
  score,
  submission,
  submissionMessage,
  submissionSaving,
  teacherName,
}: {
  lessonId: string;
  material?: LessonMaterial | null;
  onSaveAnswers: (content: LessonMaterialJson) => void;
  score: number | null;
  submission: LessonMaterialSubmission | null;
  submissionMessage: string | null;
  submissionSaving: boolean;
  teacherName: string;
}) {
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("pointer");
  const [annotationColor, setAnnotationColor] = useState("#ff5c00");
  const [annotationStrokes, setAnnotationStrokes] = useState<AnnotationStroke[]>([]);
  const [annotationReady, setAnnotationReady] = useState(false);
  const [answers, setAnswers] = useState<MaterialAnswerState>({});
  const activeStrokeId = useRef<string | null>(null);
  const lastSyncedAnnotationRef = useRef("");

  useEffect(() => {
    setAnswers(materialAnswersFromSubmission(submission));
  }, [material?.id, submission?.id, submission?.updatedAt]);

  useEffect(() => {
    const materialId = material?.id;
    if (!materialId) {
      setAnnotationReady(false);
      setAnnotationStrokes([]);
      lastSyncedAnnotationRef.current = "";
      return undefined;
    }

    let cancelled = false;

    async function loadAnnotation() {
      try {
        const annotation = await fetchScheduledLessonMaterialAnnotation(lessonId);
        const content = annotationContentFromJson(annotation?.content);
        const serialized = JSON.stringify(content);
        if (!cancelled && serialized !== lastSyncedAnnotationRef.current) {
          lastSyncedAnnotationRef.current = serialized;
          setAnnotationStrokes(content.strokes);
        }
      } catch {
        const content = emptyAnnotationContent();
        const serialized = JSON.stringify(content);
        if (!cancelled && serialized !== lastSyncedAnnotationRef.current) {
          lastSyncedAnnotationRef.current = serialized;
          setAnnotationStrokes(content.strokes);
        }
      } finally {
        if (!cancelled) {
          setAnnotationReady(true);
        }
      }
    }

    setAnnotationReady(false);
    lastSyncedAnnotationRef.current = "";
    setAnnotationStrokes([]);
    void loadAnnotation();
    const intervalId = window.setInterval(() => {
      void loadAnnotation();
    }, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [lessonId, material?.id]);

  useEffect(() => {
    if (!material?.id || !annotationReady) {
      return undefined;
    }

    const content = annotationContentFromStrokes(annotationStrokes);
    const serialized = JSON.stringify(content);
    if (serialized === lastSyncedAnnotationRef.current) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      saveScheduledLessonMaterialAnnotation(lessonId, { content })
        .then(() => {
          lastSyncedAnnotationRef.current = serialized;
        })
        .catch(() => {
          // The next local edit or polling cycle will retry without blocking the lesson UI.
        });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [annotationReady, annotationStrokes, lessonId, material?.id]);

  function updateAnswer(blockId: string, answer: MaterialAnswerBlock) {
    setAnswers((current) => ({
      ...current,
      [blockId]: answer,
    }));
  }

  function submitAnswers() {
    if (!material) {
      return;
    }
    onSaveAnswers({
      schemaVersion: 1,
      materialId: material.id,
      answers,
    });
  }

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
          {material ? (
            <LessonMaterialDocumentView
              answers={answers}
              material={material}
              mode="classroom"
              onAnswerChange={updateAnswer}
              score={score}
            />
          ) : (
            <FallbackLessonDocument />
          )}
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
        <Button disabled={!material || submissionSaving} onClick={submitAnswers} type="button">
          {submissionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submissionSaving ? "Отправляем" : "Отправить"}
        </Button>
        {submissionMessage ? <span className="playsay-task-submit-status">{submissionMessage}</span> : null}
        <span className="playsay-task-teacher">{teacherName}</span>
      </footer>
    </div>
  );
}

function LessonMaterialDocumentView({
  answers = {},
  material,
  mode = "classroom",
  onAnswerChange,
  score,
}: {
  answers?: MaterialAnswerState;
  material: LessonMaterial;
  mode?: MaterialRenderMode;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
  score?: number | null;
}) {
  const document = editorDocumentFromJson(material.document);
  const page = document.pages[0] ?? defaultMaterialPage(material.title);
  const maxScore = materialMaxScore(material.scoringRubric);
  const assetIds = materialDocumentAssetIds(document);
  const assetKey = assetIds.join("|");
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    if (material.id === "preview" || assetKey.length === 0) {
      setAssetUrls({});
      return () => {
        active = false;
      };
    }

    fetchMaterialAssets(material.id)
      .then((assets) => {
        if (active) {
          setAssetUrls(materialAssetUrlMap(assets));
        }
      })
      .catch(() => {
        if (active) {
          setAssetUrls({});
        }
      });

    return () => {
      active = false;
    };
  }, [assetKey, material.id]);

  return (
    <div className="playsay-rendered-material">
      <div className="playsay-material-score-badge">
        <span>{material.cefrLevel}</span>
        <strong>{formatMaterialScore(score ?? maxScore)}</strong>
      </div>
      <div className="playsay-task-kicker">
        <FileText className="h-4 w-4 text-primary" />
        {material.title}
      </div>
      <h3>{page.title}</h3>
      {material.description ? <p className="playsay-task-subtitle">{material.description}</p> : null}
      <div className="playsay-material-blocks">
        {page.blocks.map((block) => (
          <RenderedMaterialBlock
            answer={answers[block.id]}
            assetUrls={assetUrls}
            block={block}
            key={block.id}
            mode={mode}
            onAnswerChange={onAnswerChange}
          />
        ))}
      </div>
    </div>
  );
}

function RenderedMaterialBlock({
  answer,
  assetUrls,
  block,
  mode,
  onAnswerChange,
}: {
  answer?: MaterialAnswerBlock;
  assetUrls: Record<string, string>;
  block: MaterialEditorBlock;
  mode: MaterialRenderMode;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
}) {
  const contextLabel = materialBlockContextLabel(block);
  const blockSection = (children: ReactNode, className = "playsay-render-block") => (
    <section
      className={className}
      data-playsay-block-id={block.id}
      data-playsay-block-type={block.type}
      data-playsay-context-label={contextLabel}
    >
      <span className="playsay-visually-hidden">{contextLabel}</span>
      {children}
    </section>
  );

  switch (block.type) {
    case "text":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <p>{block.body}</p>
        </>,
      );
    case "videoEmbed":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <div className="playsay-video-embed-placeholder">
            <Video className="h-5 w-5 text-primary" />
            <span>{block.provider ?? "VIDEO"}</span>
            <small>{block.url || "Ссылка на видео будет здесь"}</small>
          </div>
        </>,
      );
    case "image":
    case "generatedImage":
      {
        const imageUrl = resolveMaterialImageUrl(block.url, assetUrls);
        return blockSection(
          <>
            <h4>{block.title}</h4>
            {imageUrl ? (
              <figure className="playsay-rendered-image">
                <img alt={block.caption || block.prompt || block.title} src={imageUrl} />
                {block.caption ? <figcaption>{block.caption}</figcaption> : null}
              </figure>
            ) : (
              <figure className="playsay-image-placeholder">
                <ImageIcon className="h-6 w-6 text-primary" />
                <figcaption>{block.caption || block.prompt || block.url || "Изображение"}</figcaption>
              </figure>
            )}
          </>,
        );
      }
    case "flashcards":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <div className="playsay-flashcards">
            {(block.cards ?? []).map((card) => (
              <article key={card.id}>
                <strong>{card.front}</strong>
                <span>{card.back}</span>
                {card.example ? <small>{card.example}</small> : null}
              </article>
            ))}
          </div>
        </>,
      );
    case "fillGaps":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <RenderedFillGapExercise answer={answer} block={block} onAnswerChange={onAnswerChange} />
        </>,
      );
    case "multipleChoice":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <RenderedChoiceExercise answer={answer} block={block} onAnswerChange={onAnswerChange} />
        </>,
      );
    case "matchingPairs":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <RenderedMatchingPairsExercise
            answer={answer}
            assetUrls={assetUrls}
            block={block}
            mode={mode}
            onAnswerChange={onAnswerChange}
          />
        </>,
      );
    case "freeWriting":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <p>{block.prompt}</p>
          <textarea
            className="playsay-student-answer"
            onChange={(event) => onAnswerChange?.(block.id, {
              type: "freeWriting",
              text: event.target.value,
              context: materialAnswerContextForBlock(block),
            })}
            placeholder="Ответ ученика"
            value={materialAnswerText(answer)}
          />
        </>,
      );
    case "speakingPrompt":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <p>{block.prompt}</p>
        </>,
        "playsay-render-block playsay-speaking-prompt",
      );
    case "drawingArea":
      return blockSection(
        <>
          <h4>{block.title}</h4>
          <div className="playsay-drawing-area" style={{ minHeight: block.height ?? 220 }} />
        </>,
      );
    default:
      return null;
  }
}

function RenderedFillGapExercise({
  answer,
  block,
  onAnswerChange,
}: {
  answer?: MaterialAnswerBlock;
  block: MaterialEditorBlock;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
}) {
  const answers = materialAnswerItems(answer);
  const attempts = materialAnswerAttempts(answer);
  const hints = materialAnswerHints(answer);

  function updateItemValue(itemKey: string, value: string) {
    onAnswerChange?.(block.id, {
      type: "fillGaps",
      items: {
        ...answers,
        [itemKey]: value,
      },
      attempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function checkItem(itemKey: string, value = answers[itemKey] ?? "") {
    const item = (block.items ?? []).find((candidate, index) => `${candidate.prompt}-${index}` === itemKey);
    const nextAttempts = appendMaterialAttempt(attempts, itemKey, value, materialItemAnswerMatches(item, value));
    onAnswerChange?.(block.id, {
      type: "fillGaps",
      items: {
        ...answers,
        [itemKey]: value,
      },
      attempts: nextAttempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function requestHint(itemKey: string, item: MaterialExerciseItem) {
    const itemHints = hints[itemKey] ?? [];
    const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, block.assessment, true);
    if (!canRequestManualInputHint(item, itemHints, status)) {
      return;
    }

    onAnswerChange?.(block.id, {
      type: "fillGaps",
      items: answers,
      attempts,
      context: materialAnswerContextForBlock(block),
      hints: appendMaterialHint(hints, itemKey, materialHintForExerciseItem(item, block, itemHints.length + 1)),
    });
  }

  function handleManualInputKeyDown(event: KeyboardEvent<HTMLInputElement>, itemKey: string) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    checkItem(itemKey, event.currentTarget.value);
  }

  return (
    <div className="playsay-fill-exercise">
      {(block.items ?? []).map((item, index) => {
        const itemKey = `${item.prompt}-${index}`;
        const options = materialExerciseOptions(item, block);
        const isManualInput = options.length === 0;
        const prompt = splitGapPrompt(item.prompt);
        const itemHints = hints[itemKey] ?? [];
        const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, block.assessment, isManualInput);
        const hintPreview = isManualInput ? materialManualInputHintPreview(item, itemHints) : "";
        const inlineHint = isManualInput ? materialManualInputInlineHint(item, itemHints, answers[itemKey] ?? "") : "";
        const canRequestHint = isManualInput && canRequestManualInputHint(item, itemHints, status);

        return (
          <div className="playsay-answer-row" data-input-mode={isManualInput ? "manual" : "select"} data-status={status.kind} key={itemKey}>
            <label>
              {prompt.before ? <span>{prompt.before}</span> : null}
              {options.length > 0 ? (
                <span className="playsay-inline-answer-wrap">
                  <select
                    aria-label={`gap ${index + 1}`}
                    className="playsay-inline-select"
                    data-status={status.kind}
                    disabled={status.locked || status.correct}
                    onChange={(event) => checkItem(itemKey, event.target.value)}
                    value={answers[itemKey] ?? ""}
                  >
                    <option value="">Выбрать</option>
                    {options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <MaterialAttemptBar status={status} />
                </span>
              ) : (
                <span className="playsay-inline-answer-wrap">
                  <span className="playsay-inline-answer" data-status={status.kind}>
                    <input
                      aria-label={`gap ${index + 1}`}
                      disabled={status.locked || status.correct}
                      onChange={(event) => updateItemValue(itemKey, event.target.value)}
                      onKeyDown={(event) => handleManualInputKeyDown(event, itemKey)}
                      placeholder={!answers[itemKey]?.trim() ? hintPreview || undefined : undefined}
                      value={answers[itemKey] ?? ""}
                    />
                    {inlineHint ? <span className="playsay-inline-hint-ghost">{inlineHint}</span> : null}
                    <button
                      aria-label="Проверить ответ"
                      className="playsay-inline-check"
                      disabled={status.locked || status.correct || !answers[itemKey]?.trim()}
                      onClick={() => checkItem(itemKey)}
                      title="Проверить ответ (Enter)"
                      type="button"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <MaterialAttemptBar status={status} />
                </span>
              )}
              {prompt.after ? <span>{prompt.after}</span> : null}
            </label>
            <MaterialAnswerTools
              canRequestHint={canRequestHint}
              onHint={() => requestHint(itemKey, item)}
              status={status}
            />
          </div>
        );
      })}
    </div>
  );
}

function RenderedChoiceExercise({
  answer,
  block,
  onAnswerChange,
}: {
  answer?: MaterialAnswerBlock;
  block: MaterialEditorBlock;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
}) {
  const answers = materialAnswerItems(answer);
  const attempts = materialAnswerAttempts(answer);
  const hints = materialAnswerHints(answer);

  function updateItemValue(itemKey: string, value: string) {
    onAnswerChange?.(block.id, {
      type: "multipleChoice",
      items: {
        ...answers,
        [itemKey]: value,
      },
      attempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function checkItem(itemKey: string, value = answers[itemKey] ?? "") {
    const item = (block.items ?? []).find((candidate, index) => `${candidate.prompt}-${index}` === itemKey);
    const nextAttempts = appendMaterialAttempt(attempts, itemKey, value, materialItemAnswerMatches(item, value));
    onAnswerChange?.(block.id, {
      type: "multipleChoice",
      items: {
        ...answers,
        [itemKey]: value,
      },
      attempts: nextAttempts,
      context: materialAnswerContextForBlock(block),
      hints,
    });
  }

  function requestHint(itemKey: string, item: MaterialExerciseItem) {
    const itemHints = hints[itemKey] ?? [];
    const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, block.assessment, true);
    if (!canRequestManualInputHint(item, itemHints, status)) {
      return;
    }

    onAnswerChange?.(block.id, {
      type: "multipleChoice",
      items: answers,
      attempts,
      context: materialAnswerContextForBlock(block),
      hints: appendMaterialHint(hints, itemKey, materialHintForExerciseItem(item, block, itemHints.length + 1)),
    });
  }

  function handleManualInputKeyDown(event: KeyboardEvent<HTMLInputElement>, itemKey: string) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    checkItem(itemKey, event.currentTarget.value);
  }

  return (
    <div className="playsay-choice-list">
      {(block.items ?? []).map((item, index) => {
        const itemKey = `${item.prompt}-${index}`;
        const options = materialExerciseOptions(item, block);
        const isManualInput = options.length === 0;
        const itemHints = hints[itemKey] ?? [];
        const status = materialAnswerStatus(item, answers[itemKey], attempts[itemKey], itemHints, block.assessment, isManualInput);
        const hintPreview = isManualInput ? materialManualInputHintPreview(item, itemHints) : "";
        const inlineHint = isManualInput ? materialManualInputInlineHint(item, itemHints, answers[itemKey] ?? "") : "";
        const canRequestHint = isManualInput && canRequestManualInputHint(item, itemHints, status);

        return (
          <div className="playsay-answer-row" data-input-mode={isManualInput ? "manual" : "select"} data-status={status.kind} key={itemKey}>
            <label className="playsay-choice-row" data-status={status.kind}>
              <span>{item.prompt}</span>
              {options.length > 0 ? (
                <span className="playsay-inline-answer-wrap">
                  <select
                    aria-label={`choice ${index + 1}`}
                    className="playsay-inline-select"
                    data-status={status.kind}
                    disabled={status.locked || status.correct}
                    onChange={(event) => checkItem(itemKey, event.target.value)}
                    value={answers[itemKey] ?? ""}
                  >
                    <option value="">Выбрать</option>
                    {options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <MaterialAttemptBar status={status} />
                </span>
              ) : (
                <span className="playsay-inline-answer-wrap">
                  <span className="playsay-inline-answer" data-status={status.kind}>
                    <input
                      aria-label={`choice ${index + 1}`}
                      className="playsay-inline-input"
                      disabled={status.locked || status.correct}
                      onChange={(event) => updateItemValue(itemKey, event.target.value)}
                      onKeyDown={(event) => handleManualInputKeyDown(event, itemKey)}
                      placeholder={!answers[itemKey]?.trim() ? hintPreview || undefined : undefined}
                      value={answers[itemKey] ?? ""}
                    />
                    {inlineHint ? <span className="playsay-inline-hint-ghost">{inlineHint}</span> : null}
                    <button
                      aria-label="Проверить ответ"
                      className="playsay-inline-check"
                      disabled={status.locked || status.correct || !answers[itemKey]?.trim()}
                      onClick={() => checkItem(itemKey)}
                      title="Проверить ответ (Enter)"
                      type="button"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <MaterialAttemptBar status={status} />
                </span>
              )}
            </label>
            <MaterialAnswerTools
              canRequestHint={canRequestHint}
              onHint={() => requestHint(itemKey, item)}
              status={status}
            />
          </div>
        );
      })}
    </div>
  );
}

function MaterialAnswerTools({
  canRequestHint,
  onHint,
  status,
}: {
  canRequestHint: boolean;
  onHint: () => void;
  status: MaterialAnswerStatus;
}) {
  const nextHintNumber = Math.min(status.hintsUsed + 1, MAX_MANUAL_INPUT_HINTS);
  if (!canRequestHint) {
    return null;
  }

  return (
    <div className="playsay-answer-tools">
      <button
        aria-label={`Подсказка ${nextHintNumber} из ${MAX_MANUAL_INPUT_HINTS}`}
        className="playsay-hint-button"
        onClick={onHint}
        title={`Подсказка ${nextHintNumber} из ${MAX_MANUAL_INPUT_HINTS}`}
        type="button"
      >
        <FileText className="h-3.5 w-3.5" />
        {nextHintNumber}/{MAX_MANUAL_INPUT_HINTS}
      </button>
    </div>
  );
}

function MaterialAttemptBar({ status }: { status: MaterialAnswerStatus }) {
  if (status.kind === "empty" || status.kind === "draft") {
    return null;
  }

  const maxAttempts = Math.max(1, status.maxAttempts);
  const redPercent = status.locked
    ? 100
    : Math.min(100, Math.max(0, (status.incorrectAttempts / maxAttempts) * 100));
  const label = status.locked
    ? `Попытки закончились: ${status.incorrectAttempts} из ${maxAttempts}`
    : status.correct
      ? `Ответ принят: ошибок до ответа ${status.incorrectAttempts} из ${maxAttempts}`
      : `Ошибок ${status.incorrectAttempts} из ${maxAttempts}`;
  const style = {
    "--playsay-answer-red": `${redPercent}%`,
  } as CSSProperties;

  return (
    <span
      aria-label={label}
      className="playsay-answer-attempt-bar"
      data-kind={status.kind}
      role="img"
      style={style}
      title={label}
    />
  );
}

function RenderedMatchingPairsExercise({
  answer,
  assetUrls,
  block,
  mode,
  onAnswerChange,
}: {
  answer?: MaterialAnswerBlock;
  assetUrls: Record<string, string>;
  block: MaterialEditorBlock;
  mode: MaterialRenderMode;
  onAnswerChange?: (blockId: string, answer: MaterialAnswerBlock) => void;
}) {
  const pairs = block.pairs ?? emptyMaterialMatchingPairs;
  const rightOptions = mode === "teacherPreview" ? pairs : matchingRightOptions(pairs);
  const [activeLeftId, setActiveLeftId] = useState<string | null>(null);
  const matches = materialAnswerMatches(answer);
  const attempts = materialAnswerAttempts(answer);
  const hints = materialAnswerHints(answer);
  const matchesKey = Object.entries(matches).map(([leftId, rightId]) => `${leftId}:${rightId}`).sort().join("|");
  const [lines, setLines] = useState<Array<{ id: string; x1: number; x2: number; y1: number; y2: number }>>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rightRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    function updateLines() {
      const container = containerRef.current;
      if (!container) {
        setLines([]);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const nextLines = Object.entries(matches).flatMap(([leftId, rightId]) => {
        const leftNode = leftRefs.current[leftId];
        const rightNode = rightRefs.current[rightId];
        if (!leftNode || !rightNode) {
          return [];
        }

        const leftRect = leftNode.getBoundingClientRect();
        const rightRect = rightNode.getBoundingClientRect();
        return [{
          id: leftId,
          x1: leftRect.right - containerRect.left,
          y1: leftRect.top + leftRect.height / 2 - containerRect.top,
          x2: rightRect.left - containerRect.left,
          y2: rightRect.top + rightRect.height / 2 - containerRect.top,
        }];
      });
      setLines(nextLines);
    }

    updateLines();
    window.addEventListener("resize", updateLines);
    return () => window.removeEventListener("resize", updateLines);
  }, [matchesKey, pairs]);

  function connectPair(rightId: string) {
    if (!activeLeftId) {
      return;
    }

    onAnswerChange?.(block.id, {
      type: "matchingPairs",
      matches: {
        ...matches,
        [activeLeftId]: rightId,
      },
      attempts: appendMaterialAttempt(attempts, activeLeftId, rightId, activeLeftId === rightId),
      hints,
    });
    setActiveLeftId(null);
  }

  if (pairs.length === 0) {
    return (
      <div className="playsay-match-empty">
        <Link2 className="h-5 w-5 text-primary" />
        <span>Matching pairs</span>
      </div>
    );
  }

  return (
    <div className="playsay-matching-exercise" ref={containerRef}>
      <svg className="playsay-match-lines" aria-hidden="true">
        {lines.map((line) => (
          <line key={line.id} x1={line.x1} x2={line.x2} y1={line.y1} y2={line.y2} />
        ))}
      </svg>
      <div className="playsay-match-rows">
        {pairs.map((leftPair, index) => {
          const pair = rightOptions[index] ?? leftPair;
          const imageUrl = resolveMaterialImageUrl(pair.imageUrl, assetUrls);
          const hasPendingAsset = Boolean(materialAssetIdFromUrl(pair.imageUrl) && !imageUrl);
          const connected = Object.values(matches).includes(pair.id);
          return (
            <div className="playsay-match-row" key={leftPair.id}>
              <button
                className="playsay-match-word"
                data-active={activeLeftId === leftPair.id ? "true" : "false"}
                data-connected={matches[leftPair.id] ? "true" : "false"}
                data-status={materialMatchingStatus(leftPair.id, matches[leftPair.id], attempts[leftPair.id], block.assessment)}
                onClick={() => setActiveLeftId((current) => (current === leftPair.id ? null : leftPair.id))}
                ref={(node) => { leftRefs.current[leftPair.id] = node; }}
                type="button"
              >
                {leftPair.left}
              </button>
              <button
                aria-label={`picture ${index + 1}`}
                className="playsay-match-picture"
                data-connected={connected ? "true" : "false"}
                onClick={() => connectPair(pair.id)}
                ref={(node) => { rightRefs.current[pair.id] = node; }}
                type="button"
              >
                {imageUrl ? (
                  <img alt={pair.imageAlt || pair.right} src={imageUrl} />
                ) : (
                  <span className="playsay-match-generated-thumb" aria-hidden="true">
                    {hasPendingAsset ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                  </span>
                )}
                <span>Картинка {index + 1}</span>
                {!imageUrl ? (
                  <small>{hasPendingAsset ? "Загружаем картинку" : pair.imagePrompt || pair.imageAlt || pair.right}</small>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function matchingRightOptions(pairs: MaterialMatchingPair[]): MaterialMatchingPair[] {
  return [...pairs].sort((left, right) => matchingPairSortKey(left) - matchingPairSortKey(right));
}

function matchingPairSortKey(pair: MaterialMatchingPair): number {
  return `${pair.id}:${pair.right}`.split("").reduce((hash, char) => (
    (hash * 31 + char.charCodeAt(0)) % 10_000
  ), 7);
}

function materialExerciseOptions(item: MaterialExerciseItem, block: MaterialEditorBlock): string[] {
  const configuredOptions = uniqueMaterialOptions(item.options ?? []);
  if (configuredOptions.length > 0) {
    return configuredOptions;
  }

  const answer = normalizeMaterialAnswer(item.answer);
  const articleContext = `${block.title} ${block.body ?? ""} ${block.prompt ?? ""} ${item.prompt}`.toLowerCase();
  if (
    ["a", "an", "-"].includes(answer) ||
    articleContext.includes("article") ||
    articleContext.includes("артик")
  ) {
    return ["a", "an", "-"];
  }

  return [];
}

function appendMaterialAttempt(
  attempts: Record<string, MaterialAttemptEntry[]>,
  itemKey: string,
  value: string,
  correct: boolean,
): Record<string, MaterialAttemptEntry[]> {
  const cleanValue = value.trim();
  if (!cleanValue) {
    return attempts;
  }
  const current = attempts[itemKey] ?? [];
  const latest = current[current.length - 1];
  if (latest?.value === cleanValue) {
    return attempts;
  }
  return {
    ...attempts,
    [itemKey]: [
      ...current,
      {
        at: new Date().toISOString(),
        correct,
        value: cleanValue,
      },
    ],
  };
}

function appendMaterialHint(
  hints: Record<string, MaterialHintEntry[]>,
  itemKey: string,
  hint: MaterialHintEntry,
): Record<string, MaterialHintEntry[]> {
  const current = hints[itemKey] ?? [];
  return {
    ...hints,
    [itemKey]: [...current, hint],
  };
}

function canRequestManualInputHint(
  item: MaterialExerciseItem,
  hints: MaterialHintEntry[],
  status: MaterialAnswerStatus,
): boolean {
  return Boolean(item.answer?.trim()) && hints.length < MAX_MANUAL_INPUT_HINTS && !status.locked && !status.correct;
}

function materialManualInputHintPreview(item: MaterialExerciseItem, hints: MaterialHintEntry[]): string {
  const latestHint = hints[hints.length - 1];
  if (latestHint?.value) {
    return latestHint.value;
  }
  if (hints.length === 0) {
    return "";
  }
  return materialProgressiveHintValue(item.answer ?? "", hints.length);
}

function materialManualInputInlineHint(item: MaterialExerciseItem, hints: MaterialHintEntry[], value: string): string {
  const hint = materialManualInputHintPreview(item, hints);
  const cleanValue = value.trim();
  if (!hint || !cleanValue) {
    return "";
  }

  if (materialItemAnswerMatches(item, cleanValue)) {
    return "";
  }

  if (hint.toLowerCase().startsWith(cleanValue.toLowerCase()) && cleanValue.length < hint.length) {
    return hint.slice(cleanValue.length);
  }

  const hintPrefix = hint.replace(/\.\.\.$/, "");
  if (hintPrefix && cleanValue.toLowerCase().startsWith(hintPrefix.toLowerCase())) {
    return "";
  }

  if (normalizeMaterialAnswer(hint) === normalizeMaterialAnswer(cleanValue)) {
    return "";
  }

  return hint;
}

function materialHintForExerciseItem(item: MaterialExerciseItem, block: MaterialEditorBlock, hintNumber: number): MaterialHintEntry {
  const answer = item.answer?.trim() ?? "";
  const penalty = cleanMaterialAssessment(block.assessment ?? defaultObjectiveAssessmentPolicy()).hintPenalty ?? 0.15;
  const level = Math.min(Math.max(hintNumber, 1), MAX_MANUAL_INPUT_HINTS);
  const value = materialProgressiveHintValue(answer, level);
  const type = level === 1 ? "firstLetter" : level === 2 ? "partialAnswer" : "fullAnswer";
  return {
    at: new Date().toISOString(),
    label: level >= MAX_MANUAL_INPUT_HINTS ? `Ответ: ${value}` : `Подсказка ${level}: ${value}`,
    penalty,
    type,
    value,
  };
}

function materialProgressiveHintValue(answer: string, level: number): string {
  const cleanAnswer = answer.trim();
  if (!cleanAnswer) {
    return "";
  }
  if (level >= MAX_MANUAL_INPUT_HINTS) {
    return cleanAnswer;
  }

  return cleanAnswer
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) {
        return part;
      }
      const characters = Array.from(part);
      if (characters.length === 0) {
        return "";
      }
      const revealCount = level === 1 ? 1 : Math.min(characters.length, Math.max(2, Math.ceil(characters.length / 2)));
      const preview = characters.slice(0, revealCount).join("");
      return revealCount >= characters.length ? preview : `${preview}...`;
    })
    .join("");
}

function materialBlockContextLabel(block: MaterialEditorBlock): string {
  const parts = [
    `block:${block.type}`,
    `title:${block.title}`,
    block.body ? `body:${block.body}` : "",
    block.prompt ? `prompt:${block.prompt}` : "",
    ...(block.items ?? []).map((item, index) => `item${index + 1}:${item.prompt}`),
  ].filter(Boolean);
  return parts.join(" | ").slice(0, 900);
}

function materialAnswerContextForBlock(block: MaterialEditorBlock): LessonMaterialJson {
  const items = (block.items ?? []).map((item, index, allItems) => ({
    key: `${item.prompt}-${index}`,
    prompt: item.prompt,
    previousPrompt: allItems[index - 1]?.prompt ?? null,
    nextPrompt: allItems[index + 1]?.prompt ?? null,
    options: item.options ?? [],
  }));

  return {
    blockId: block.id,
    blockType: block.type,
    title: block.title,
    label: materialBlockContextLabel(block),
    body: block.body ?? null,
    prompt: block.prompt ?? null,
    items,
  };
}

function materialItemAnswerMatches(item: MaterialExerciseItem | undefined, value: string): boolean {
  const expected = normalizeMaterialAnswer(item?.answer);
  if (!expected || !value.trim()) {
    return false;
  }
  return normalizeMaterialAnswer(value) === expected;
}

function materialAnswerStatus(
  item: MaterialExerciseItem,
  value: string | undefined,
  attempts: MaterialAttemptEntry[] | undefined,
  hints: MaterialHintEntry[],
  policy?: MaterialAssessmentPolicy,
  requiresExplicitCheck = false,
): MaterialAnswerStatus {
  const cleanPolicy = cleanMaterialAssessment(policy ?? defaultObjectiveAssessmentPolicy());
  const cleanValue = value?.trim() ?? "";
  const currentAttempts = attempts ?? [];
  const latestAttempt = currentAttempts[currentAttempts.length - 1];
  const currentValueChecked = Boolean(cleanValue && latestAttempt?.value.trim() === cleanValue);
  const checkedByPolicy = !requiresExplicitCheck || currentValueChecked;
  const maxAttempts = cleanPolicy.maxAttempts ?? 3;
  const attemptCount = currentAttempts.length || (!requiresExplicitCheck && cleanValue ? 1 : 0);
  const incorrectAttempts = currentAttempts.filter((attempt) => (
    attempt.correct === false || (attempt.correct !== true && !materialItemAnswerMatches(item, attempt.value))
  )).length;
  const answerIsCorrect = materialItemAnswerMatches(item, cleanValue);
  const visibleCorrect = answerIsCorrect && checkedByPolicy;
  const locked = !visibleCorrect && cleanPolicy.lockAfterAttempts === true && incorrectAttempts >= maxAttempts;
  const baseStatus = {
    attemptsUsed: attemptCount,
    correct: false,
    incorrectAttempts,
    hintsUsed: hints.length,
    locked: false,
    maxAttempts,
  };

  if (!cleanValue) {
    return { ...baseStatus, icon: AlertCircle, kind: "empty", label: "Нет ответа" };
  }
  if (locked) {
    return { ...baseStatus, icon: LockKeyhole, kind: "locked", label: "Попытки закончились", locked: true };
  }
  if (requiresExplicitCheck && !currentValueChecked) {
    return { ...baseStatus, icon: CheckCircle2, kind: "draft", label: "Проверить" };
  }
  if (visibleCorrect && hints.length > 0) {
    return { ...baseStatus, correct: true, icon: CheckCircle2, kind: "hint", label: "Ответ принят" };
  }
  if (visibleCorrect && incorrectAttempts > 0) {
    return { ...baseStatus, correct: true, icon: CheckCircle2, kind: "retry", label: "Ответ принят" };
  }
  if (visibleCorrect) {
    return { ...baseStatus, correct: true, icon: CheckCircle2, kind: "correct", label: "Ответ принят" };
  }
  return { ...baseStatus, icon: AlertCircle, kind: "wrong", label: `${Math.max(1, incorrectAttempts)} ошибка` };
}

function materialMatchingStatus(
  leftId: string,
  value: string | undefined,
  attempts: MaterialAttemptEntry[] | undefined,
  policy?: MaterialAssessmentPolicy,
): MaterialAnswerStatus["kind"] {
  const cleanPolicy = cleanMaterialAssessment(policy ?? defaultObjectiveAssessmentPolicy());
  const incorrectAttempts = attempts?.filter((attempt) => attempt.correct === false).length ?? 0;
  if (!value) {
    return "empty";
  }
  if (value === leftId) {
    return incorrectAttempts > 0 ? "retry" : "correct";
  }
  if (cleanPolicy.lockAfterAttempts === true && incorrectAttempts >= (cleanPolicy.maxAttempts ?? 3)) {
    return "locked";
  }
  return "wrong";
}

function splitGapPrompt(prompt: string): { before: string; after: string } {
  const match = prompt.match(/^(.*?)(___|__|…|\.\.\.)(.*)$/);
  if (!match) {
    return { before: prompt, after: "" };
  }

  return {
    before: match[1].trimEnd(),
    after: match[3].trimStart(),
  };
}

function uniqueMaterialOptions(options: string[]): string[] {
  const result: string[] = [];
  options.forEach((option) => {
    const normalized = option.trim();
    if (normalized && !result.includes(normalized)) {
      result.push(normalized);
    }
  });
  return result;
}

function normalizeMaterialAnswer(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (["no article", "no article needed", "zero article", "нет артикля"].includes(normalized)) {
    return "-";
  }
  return normalized;
}

function FallbackLessonDocument() {
  return (
    <>
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
    </>
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

function defaultMaterialForm(): MaterialFormState {
  return {
    id: null,
    title: "",
    description: "",
    language: "en",
    cefrLevel: "A2",
    visibility: "PRIVATE",
    status: "DRAFT",
    sourcePrompt: "",
    document: defaultMaterialDocument(),
    scoringRubric: {
      scale: 10,
      maxScore: 10,
      criteria: [
        { id: "accuracy", title: "Accuracy", maxScore: 4 },
        { id: "fluency", title: "Fluency", maxScore: 3 },
        { id: "task", title: "Task completion", maxScore: 3 },
      ],
    },
    sourceMeta: {
      kind: "MANUAL",
      prompt: "",
    },
  };
}

function defaultMaterialDocument(title = "Новый материал"): MaterialEditorDocument {
  return {
    schemaVersion: 1,
    pages: [defaultMaterialPage(title)],
  };
}

function defaultMaterialPage(title = "Новый материал"): MaterialEditorPage {
  return {
    id: createClientId("page"),
    title,
    layout: "FLOW",
    blocks: [
      {
        id: createClientId("block"),
        type: "text",
        title: "Цель урока",
        body: "Добавьте короткую инструкцию, упражнение, видео или карточки.",
      },
    ],
  };
}

function newMaterialBlock(type: MaterialBlockType): MaterialEditorBlock {
  const base = {
    id: createClientId("block"),
    type,
    title: materialBlockLabel(type),
  };

  switch (type) {
    case "videoEmbed":
      return { ...base, provider: "YOUTUBE", url: "" };
    case "image":
      return { ...base, caption: "", url: "" };
    case "generatedImage":
      return { ...base, caption: "", prompt: "" };
    case "flashcards":
      return {
        ...base,
        cards: [
          { id: createClientId("card"), front: "boarding pass", back: "посадочный талон", example: "Show your boarding pass at the gate." },
        ],
      };
    case "fillGaps":
      return {
        ...base,
        assessment: defaultObjectiveAssessmentPolicy(),
        items: [{ prompt: "I am ___ the airport.", answer: "at" }],
      };
    case "multipleChoice":
      return {
        ...base,
        assessment: defaultObjectiveAssessmentPolicy(),
        items: [{ prompt: "Choose the correct answer.", answer: "at", options: ["at", "in", "on"] }],
      };
    case "matchingPairs":
      return {
        ...base,
        assessment: defaultObjectiveAssessmentPolicy(),
        pairs: [
          {
            id: createClientId("pair"),
            left: "owl",
            right: "owl",
            imagePrompt: "child-friendly workbook illustration of an owl, white background",
            imageAlt: "owl",
          },
          {
            id: createClientId("pair"),
            left: "penguin",
            right: "penguin",
            imagePrompt: "child-friendly workbook illustration of a penguin, white background",
            imageAlt: "penguin",
          },
        ],
      };
    case "freeWriting":
      return { ...base, prompt: "Write 3-5 sentences." };
    case "speakingPrompt":
      return { ...base, prompt: "Discuss the questions with your teacher." };
    case "drawingArea":
      return { ...base, height: 240 };
    case "text":
    default:
      return { ...base, body: "Введите текст задания." };
  }
}

function defaultObjectiveAssessmentPolicy(): MaterialAssessmentPolicy {
  return {
    weight: 1,
    maxAttempts: 3,
    attemptPenalty: 0.3,
    hintPenalty: 0.15,
    lockAfterAttempts: true,
  };
}

async function prepareMaterialDraftSourceImage(file: File): Promise<MaterialDraftSourceImage> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Поддерживаются JPEG, PNG и WebP.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Изображение должно быть меньше 12 МБ.");
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadHtmlImage(rawDataUrl);
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Браузер не смог подготовить изображение.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.84;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > 2_400_000 && quality > 0.58) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > 2_400_000) {
    throw new Error("Изображение слишком большое после сжатия. Попробуйте обрезать фото ближе к заданию.");
  }

  return {
    dataUrl,
    fileName: file.name || "worksheet.jpg",
    originalSize: file.size,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Не удалось прочитать файл."));
      }
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(file);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось открыть изображение."));
    image.src = src;
  });
}

function materialToForm(material: LessonMaterial): MaterialFormState {
  const sourceMeta = asJsonObject(material.sourceMeta);

  return {
    id: material.id,
    title: material.title,
    description: material.description ?? "",
    language: material.language || "en",
    cefrLevel: material.cefrLevel || "A2",
    visibility: material.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
    status: material.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    sourcePrompt: readPromptFromSourceMeta(material.sourceMeta),
    document: editorDocumentFromJson(material.document, material.title),
    scoringRubric: asJsonObject(material.scoringRubric),
    sourceMeta,
  };
}

function materialDraftToForm(draft: LessonMaterialDraft): MaterialFormState {
  const sourceMeta = asJsonObject(draft.sourceMeta);

  return {
    id: null,
    title: draft.title,
    description: draft.description ?? "",
    language: draft.language || "en",
    cefrLevel: draft.cefrLevel || "A2",
    visibility: draft.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
    status: draft.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    sourcePrompt: readPromptFromSourceMeta(sourceMeta),
    document: editorDocumentFromJson(draft.document, draft.title),
    scoringRubric: asJsonObject(draft.scoringRubric),
    sourceMeta,
  };
}

function duplicateMaterialForm(form: MaterialFormState): MaterialFormState {
  const sourceMeta = {
    ...asJsonObject(form.sourceMeta),
    duplicatedFromMaterialId: form.id,
  };

  return {
    ...form,
    id: null,
    title: form.title.trim() ? `Копия ${form.title.trim()}` : "Копия материала",
    visibility: "PRIVATE",
    status: "DRAFT",
    document: cloneMaterialDocument(form.document),
    sourceMeta,
  };
}

function cloneMaterialDocument(document: MaterialEditorDocument): MaterialEditorDocument {
  return {
    schemaVersion: 1,
    pages: document.pages.map((page) => ({
      ...page,
      id: createClientId("page"),
      blocks: page.blocks.map(cloneMaterialBlock),
    })),
  };
}

function cloneMaterialBlock(block: MaterialEditorBlock): MaterialEditorBlock {
  return {
    ...block,
    id: createClientId("block"),
    cards: block.cards?.map((card) => ({
      ...card,
      id: createClientId("card"),
    })),
    items: block.items?.map((item) => ({ ...item })),
    pairs: block.pairs?.map((pair) => ({
      ...pair,
      id: createClientId("pair"),
    })),
  };
}

function materialFormToInput(form: MaterialFormState): LessonMaterialInput {
  const title = form.title.trim();
  const sourceMeta = {
    ...asJsonObject(form.sourceMeta),
    prompt: form.sourcePrompt.trim(),
  };

  return {
    title,
    description: form.description.trim() || null,
    language: form.language.trim() || "en",
    cefrLevel: form.cefrLevel,
    visibility: form.visibility,
    status: form.status,
    document: {
      ...form.document,
      pages: form.document.pages.map((page) => ({
        ...page,
        title: page.title.trim() || title,
        blocks: page.blocks.map((block) => cleanMaterialBlock(block)),
      })),
    } as unknown as LessonMaterialJson,
    sourceMeta,
    scoringRubric: form.scoringRubric,
  };
}

function materialPreviewFromForm(form: MaterialFormState): LessonMaterial {
  const input = materialFormToInput({
    ...form,
    title: form.title.trim() || "Новый материал",
  });
  const now = new Date().toISOString();

  return {
    id: form.id ?? "preview",
    ownerTeacherUserId: null,
    ownerTeacherSubject: null,
    ownerTeacherName: null,
    title: input.title,
    description: input.description ?? null,
    language: input.language ?? "en",
    cefrLevel: input.cefrLevel ?? "A2",
    visibility: input.visibility ?? "PRIVATE",
    status: input.status ?? "DRAFT",
    document: input.document ?? {},
    sourceMeta: input.sourceMeta ?? {},
    scoringRubric: input.scoringRubric ?? {},
    blockCount: form.document.pages.reduce((count, page) => count + page.blocks.length, 0),
    createdAt: now,
    updatedAt: now,
  };
}

function editorDocumentFromJson(value: LessonMaterialJson | unknown, fallbackTitle = "Материал"): MaterialEditorDocument {
  const root = asJsonObject(value);
  const rawPages = Array.isArray(root.pages) ? root.pages : [];
  const pages = rawPages
    .map((page, index) => materialPageFromJson(page, index, fallbackTitle))
    .filter((page): page is MaterialEditorPage => page !== null);

  if (pages.length === 0) {
    return defaultMaterialDocument(fallbackTitle);
  }

  return {
    schemaVersion: 1,
    pages,
  };
}

function materialPageFromJson(value: unknown, index: number, fallbackTitle: string): MaterialEditorPage | null {
  const page = asJsonObject(value);
  const rawBlocks = Array.isArray(page.blocks) ? page.blocks : [];
  const blocks = rawBlocks
    .map((block) => materialBlockFromJson(block))
    .filter((block): block is MaterialEditorBlock => block !== null);

  return {
    id: asString(page.id) || createClientId("page"),
    title: asString(page.title) || (index === 0 ? fallbackTitle : `Страница ${index + 1}`),
    layout: page.layout === "WORKSHEET" ? "WORKSHEET" : "FLOW",
    blocks,
  };
}

function materialBlockFromJson(value: unknown): MaterialEditorBlock | null {
  const block = asJsonObject(value);
  const type = normalizeMaterialBlockType(asString(block.type));
  if (!type) {
    return null;
  }

  const result: MaterialEditorBlock = {
    id: asString(block.id) || createClientId("block"),
    type,
    title: asString(block.title) || materialBlockLabel(type),
  };
  const assessment = materialAssessmentFromJson(block.assessment);
  if (assessment || isObjectiveMaterialBlockType(type)) {
    result.assessment = assessment ?? defaultObjectiveAssessmentPolicy();
  }

  const body = asString(block.body);
  const prompt = asString(block.prompt);
  const url = asString(block.url);
  const provider = asString(block.provider);
  const caption = asString(block.caption);
  const height = asNumber(block.height);

  if (body) {
    result.body = body;
  }
  if (prompt) {
    result.prompt = prompt;
  }
  if (url) {
    result.url = url;
  }
  if (provider) {
    result.provider = provider;
  }
  if (caption) {
    result.caption = caption;
  }
  if (height !== null) {
    result.height = Math.min(800, Math.max(120, height));
  }

  if (Array.isArray(block.cards)) {
    result.cards = block.cards.map(materialCardFromJson).filter((card): card is NonNullable<MaterialEditorBlock["cards"]>[number] => card !== null);
  }

  if (Array.isArray(block.items)) {
    result.items = block.items.map(materialItemFromJson).filter((item): item is NonNullable<MaterialEditorBlock["items"]>[number] => item !== null);
  }

  if (Array.isArray(block.pairs)) {
    result.pairs = block.pairs.map(materialMatchingPairFromJson).filter((pair): pair is MaterialMatchingPair => pair !== null);
  } else if (type === "matchingPairs" && Array.isArray(block.items)) {
    result.pairs = block.items.map(materialMatchingPairFromJson).filter((pair): pair is MaterialMatchingPair => pair !== null);
  }

  return result;
}

function cleanMaterialBlock(block: MaterialEditorBlock): MaterialEditorBlock {
  const title = block.title.trim() || materialBlockLabel(block.type);
  const clean: MaterialEditorBlock = {
    id: block.id || createClientId("block"),
    type: block.type,
    title,
  };
  if (block.assessment || isObjectiveMaterialBlockType(block.type)) {
    clean.assessment = cleanMaterialAssessment(block.assessment ?? defaultObjectiveAssessmentPolicy());
  }

  if (block.body?.trim()) {
    clean.body = block.body.trim();
  }
  if (block.prompt?.trim()) {
    clean.prompt = block.prompt.trim();
  }
  if (block.url?.trim()) {
    clean.url = block.url.trim();
  }
  if (block.provider?.trim()) {
    clean.provider = block.provider.trim();
  }
  if (block.caption?.trim()) {
    clean.caption = block.caption.trim();
  }
  if (block.height) {
    clean.height = Math.min(800, Math.max(120, block.height));
  }
  if (block.cards?.length) {
    clean.cards = block.cards
      .filter((card) => card.front.trim() || card.back.trim())
      .map((card) => ({
        id: card.id || createClientId("card"),
        front: card.front.trim(),
        back: card.back.trim(),
        example: card.example?.trim() || undefined,
      }));
  }
  if (block.items?.length) {
    clean.items = block.items
      .filter((item) => item.prompt.trim())
      .map((item) => ({
        prompt: item.prompt.trim(),
        answer: item.answer?.trim() || undefined,
        options: item.options?.map((option) => option.trim()).filter(Boolean),
        weight: item.weight && item.weight > 0 ? item.weight : undefined,
      }));
  }
  if (block.pairs?.length) {
    clean.pairs = block.pairs
      .filter((pair) => pair.left.trim() && pair.right.trim())
      .map((pair) => ({
        id: pair.id || createClientId("pair"),
        left: pair.left.trim(),
        right: pair.right.trim(),
        imagePrompt: pair.imagePrompt?.trim() || undefined,
        imageAlt: pair.imageAlt?.trim() || pair.right.trim(),
        imageUrl: pair.imageUrl?.trim() || undefined,
      }));
  }

  return clean;
}

function materialCardFromJson(value: unknown): NonNullable<MaterialEditorBlock["cards"]>[number] | null {
  const card = asJsonObject(value);
  const front = asString(card.front);
  const back = asString(card.back);
  if (!front && !back) {
    return null;
  }

  return {
    id: asString(card.id) || createClientId("card"),
    front,
    back,
    example: asString(card.example) || undefined,
  };
}

function materialItemFromJson(value: unknown): NonNullable<MaterialEditorBlock["items"]>[number] | null {
  const item = asJsonObject(value);
  const prompt = asString(item.prompt);
  if (!prompt) {
    return null;
  }
  const options = Array.isArray(item.options) ? item.options.map(asString).filter(Boolean) : [];
  const choices = Array.isArray(item.choices) ? item.choices.map(asString).filter(Boolean) : [];

  return {
    prompt,
    answer: asString(item.answer) || asString(item.correct) || undefined,
    options: uniqueMaterialOptions([...options, ...choices]),
    weight: asPositiveNumber(item.weight) ?? asPositiveNumber(asJsonObject(item.assessment).weight) ?? undefined,
  };
}

function materialAssessmentFromJson(value: unknown): MaterialAssessmentPolicy | undefined {
  const assessment = asJsonObject(value);
  if (Object.keys(assessment).length === 0) {
    return undefined;
  }
  return cleanMaterialAssessment({
    weight: asPositiveNumber(assessment.weight) ?? undefined,
    maxAttempts: asPositiveNumber(assessment.maxAttempts) ?? undefined,
    attemptPenalty: asNumber(assessment.attemptPenalty) ?? undefined,
    hintPenalty: asNumber(assessment.hintPenalty) ?? undefined,
    lockAfterAttempts: typeof assessment.lockAfterAttempts === "boolean" ? assessment.lockAfterAttempts : undefined,
  });
}

function cleanMaterialAssessment(value: MaterialAssessmentPolicy): MaterialAssessmentPolicy {
  return {
    weight: clampNumber(value.weight ?? 1, 0.1, 20),
    maxAttempts: Math.round(clampNumber(value.maxAttempts ?? 3, 1, 10)),
    attemptPenalty: clampNumber(value.attemptPenalty ?? 0.3, 0, 1),
    hintPenalty: clampNumber(value.hintPenalty ?? 0.15, 0, 1),
    lockAfterAttempts: value.lockAfterAttempts ?? true,
  };
}

function materialMatchingPairFromJson(value: unknown): MaterialMatchingPair | null {
  const pair = asJsonObject(value);
  const left = asString(pair.left) || asString(pair.word) || asString(pair.prompt);
  const right = asString(pair.right) || asString(pair.target) || asString(pair.answer) || asString(pair.correct) || left;
  if (!left || !right) {
    return null;
  }

  return {
    id: asString(pair.id) || createClientId("pair"),
    left,
    right,
    imagePrompt: asString(pair.imagePrompt) || asString(pair.promptForImage) || asString(pair.generatedImagePrompt) || undefined,
    imageAlt: asString(pair.imageAlt) || asString(pair.alt) || right,
    imageUrl: asString(pair.imageUrl) || asString(pair.url) || undefined,
  };
}

function materialDocumentAssetIds(document: MaterialEditorDocument): string[] {
  const ids = new Set<string>();
  document.pages.forEach((page) => {
    page.blocks.forEach((block) => {
      (block.pairs ?? []).forEach((pair) => {
        const assetId = materialAssetIdFromUrl(pair.imageUrl);
        if (assetId) {
          ids.add(assetId);
        }
      });
      const blockAssetId = materialAssetIdFromUrl(block.url);
      if (blockAssetId) {
        ids.add(blockAssetId);
      }
    });
  });
  return [...ids].sort();
}

function materialAssetIdFromUrl(value: string | undefined): string | null {
  const marker = "material-asset:";
  const clean = value?.trim() ?? "";
  if (!clean.startsWith(marker)) {
    return null;
  }
  return clean.slice(marker.length).trim() || null;
}

function resolveMaterialImageUrl(value: string | undefined, assetUrls: Record<string, string>): string | undefined {
  const assetId = materialAssetIdFromUrl(value);
  if (assetId) {
    return assetUrls[assetId];
  }
  return value?.trim() || undefined;
}

function materialAssetUrlMap(assets: LessonMaterialAsset[]): Record<string, string> {
  return assets.reduce<Record<string, string>>((result, asset) => {
    const contentUrl = asset.contentUrl?.trim();
    if (contentUrl) {
      result[asset.id] = contentUrl;
      return result;
    }
    const externalUrl = asset.externalUrl?.trim();
    if (externalUrl) {
      result[asset.id] = externalUrl;
    }
    return result;
  }, {});
}

function materialAnswersFromSubmission(submission: LessonMaterialSubmission | null): MaterialAnswerState {
  const content = asJsonObject(submission?.content);
  const answers = asJsonObject(content.answers);
  return Object.entries(answers).reduce<MaterialAnswerState>((result, [blockId, value]) => {
    const answer = asJsonObject(value);
    if (Object.keys(answer).length > 0) {
      result[blockId] = answer;
    }
    return result;
  }, {});
}

function materialAnswerItems(answer: MaterialAnswerBlock | undefined): Record<string, string> {
  const items = asJsonObject(answer?.items);
  return Object.entries(items).reduce<Record<string, string>>((result, [key, value]) => {
    const itemValue = asString(value);
    if (itemValue) {
      result[key] = itemValue;
    }
    return result;
  }, {});
}

function materialAnswerMatches(answer: MaterialAnswerBlock | undefined): Record<string, string> {
  const matches = asJsonObject(answer?.matches);
  return Object.entries(matches).reduce<Record<string, string>>((result, [key, value]) => {
    const matchValue = asString(value);
    if (matchValue) {
      result[key] = matchValue;
    }
    return result;
  }, {});
}

function materialAnswerAttempts(answer: MaterialAnswerBlock | undefined): Record<string, MaterialAttemptEntry[]> {
  const attempts = asJsonObject(answer?.attempts);
  return Object.entries(attempts).reduce<Record<string, MaterialAttemptEntry[]>>((result, [key, value]) => {
    const rawAttempts = Array.isArray(value) ? value : [];
    const parsed = rawAttempts
      .map((entry) => {
        if (typeof entry === "string") {
          return { at: "", value: entry };
        }
        const object = asJsonObject(entry);
        const valueText = asString(object.value);
        if (!valueText) {
          return null;
        }
        return {
          at: asString(object.at),
          correct: typeof object.correct === "boolean" ? object.correct : undefined,
          value: valueText,
        };
      })
      .filter((entry): entry is MaterialAttemptEntry => entry !== null);
    if (parsed.length > 0) {
      result[key] = parsed;
    }
    return result;
  }, {});
}

function materialAnswerHints(answer: MaterialAnswerBlock | undefined): Record<string, MaterialHintEntry[]> {
  const hints = asJsonObject(answer?.hints);
  return Object.entries(hints).reduce<Record<string, MaterialHintEntry[]>>((result, [key, value]) => {
    const rawHints = Array.isArray(value) ? value : [];
    const parsed = rawHints
      .map((entry) => {
        const object = asJsonObject(entry);
        const type = asString(object.type) || "hint";
        const label = asString(object.label) || asString(object.value);
        if (!label) {
          return null;
        }
        const hintEntry: MaterialHintEntry = {
          at: asString(object.at),
          label,
          penalty: asNumber(object.penalty) ?? 0.15,
          type,
        };
        const hintValue = asString(object.value);
        if (hintValue) {
          hintEntry.value = hintValue;
        }
        return hintEntry;
      })
      .filter((entry): entry is MaterialHintEntry => entry !== null);
    if (parsed.length > 0) {
      result[key] = parsed;
    }
    return result;
  }, {});
}

function materialAnswerText(answer: MaterialAnswerBlock | undefined): string {
  return asString(answer?.text);
}

function materialDocumentBlocks(material: LessonMaterial): MaterialEditorBlock[] {
  return editorDocumentFromJson(material.document, material.title).pages.flatMap((page) => page.blocks);
}

function hasMissingMatchingPairImages(document: MaterialEditorDocument): boolean {
  return document.pages.some((page) => page.blocks.some((block) => (
    block.type === "matchingPairs" &&
    (block.pairs ?? []).some((pair) => !pair.imageUrl?.trim() && (pair.imagePrompt?.trim() || pair.imageAlt?.trim() || pair.right.trim()))
  )));
}

function materialMaxScore(rubric: LessonMaterialJson): number {
  const object = asJsonObject(rubric);
  const maxScore = asNumber(object.maxScore);
  if (maxScore !== null) {
    return maxScore;
  }

  const scale = asNumber(object.scale);
  return scale ?? 10;
}

function readPromptFromSourceMeta(value: LessonMaterialJson | unknown): string {
  const sourceMeta = asJsonObject(value);
  return asString(sourceMeta.prompt) || asString(sourceMeta.sourceText) || "";
}

function readUrlFromSourceMeta(value: LessonMaterialJson | unknown): string {
  const sourceMeta = asJsonObject(value);
  return asString(sourceMeta.sourceUrl) || asString(sourceMeta.url) || "";
}

function flattenCourseLessonMaterialOptions(
  courses: Course[],
  lessons: CourseLessonMap,
): Array<{ key: string; label: string; courseId: string; lesson: CourseLesson }> {
  return courses.flatMap((course) =>
    (lessons[course.id] ?? []).map((lesson) => ({
      key: `${course.id}:${lesson.id}`,
      courseId: course.id,
      lesson,
      label: `${course.title} · ${lesson.orderIndex ?? "?"}. ${lesson.title}${lesson.materialTitle ? ` · ${lesson.materialTitle}` : ""}`,
    })),
  );
}

function materialBlockIcon(type: MaterialBlockType): ReactNode {
  switch (type) {
    case "videoEmbed":
      return <Video className="h-4 w-4" />;
    case "image":
      return <ImageIcon className="h-4 w-4" />;
    case "generatedImage":
      return <Bot className="h-4 w-4" />;
    case "flashcards":
      return <Layers3 className="h-4 w-4" />;
    case "fillGaps":
    case "multipleChoice":
      return <FileText className="h-4 w-4" />;
    case "matchingPairs":
      return <Link2 className="h-4 w-4" />;
    case "freeWriting":
      return <PenLine className="h-4 w-4" />;
    case "speakingPrompt":
      return <Users className="h-4 w-4" />;
    case "drawingArea":
      return <MousePointer2 className="h-4 w-4" />;
    case "text":
    default:
      return <BookOpen className="h-4 w-4" />;
  }
}

function materialBlockLabel(type: MaterialBlockType): string {
  switch (type) {
    case "text":
      return "Текст";
    case "image":
      return "Картинка";
    case "generatedImage":
      return "AI-картинка";
    case "videoEmbed":
      return "Видео";
    case "flashcards":
      return "Карточки";
    case "fillGaps":
      return "Пропуски";
    case "multipleChoice":
      return "Тест";
    case "matchingPairs":
      return "Соответствия";
    case "freeWriting":
      return "Письмо";
    case "speakingPrompt":
      return "Speaking";
    case "drawingArea":
      return "Поле";
    default:
      return "Блок";
  }
}

function isObjectiveMaterialBlockType(type: MaterialBlockType): boolean {
  return type === "fillGaps" || type === "multipleChoice" || type === "matchingPairs";
}

function parseFlashcards(value: string): MaterialEditorBlock["cards"] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [front = "", back = "", example = ""] = splitMaterialLine(line, 3);
      return {
        id: createClientId("card"),
        front: front.trim(),
        back: back.trim(),
        example: example.trim() || undefined,
      };
    })
    .filter((card) => card.front || card.back);
}

function formatFlashcards(cards: MaterialEditorBlock["cards"]): string {
  return (cards ?? [])
    .map((card) => [card.front, card.back, card.example].filter(Boolean).join(" | "))
    .join("\n");
}

function parseExerciseItems(value: string, type: "fillGaps" | "multipleChoice"): MaterialEditorBlock["items"] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [prompt = "", optionsOrAnswer = "", answer = "", weight = ""] = splitMaterialLine(line, 4);
      const parsedWeight = parseOptionalNumber(weight);
      if (type === "multipleChoice") {
        return {
          prompt: prompt.trim(),
          options: optionsOrAnswer.split(",").map((option) => option.trim()).filter(Boolean),
          answer: answer.trim() || undefined,
          weight: parsedWeight && parsedWeight > 0 ? parsedWeight : undefined,
        };
      }

      return {
        prompt: prompt.trim(),
        options: answer ? optionsOrAnswer.split(",").map((option) => option.trim()).filter(Boolean) : undefined,
        answer: (answer || optionsOrAnswer).trim() || undefined,
        weight: parsedWeight && parsedWeight > 0 ? parsedWeight : undefined,
      };
    })
    .filter((item) => item.prompt);
}

function formatExerciseItems(items: MaterialEditorBlock["items"], type: "fillGaps" | "multipleChoice"): string {
  return (items ?? [])
    .map((item) => {
      if (type === "multipleChoice") {
        return [item.prompt, item.options?.join(", "), item.answer, item.weight].filter(Boolean).join(" | ");
      }

      return [item.prompt, item.options?.join(", "), item.answer, item.weight].filter(Boolean).join(" | ");
    })
    .join("\n");
}

function parseMatchingPairs(value: string): MaterialMatchingPair[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [left = "", right = "", imagePrompt = "", imageAlt = ""] = splitMaterialLine(line, 4);
      const cleanLeft = left.trim();
      const cleanRight = (right || left).trim();
      return {
        id: createClientId("pair"),
        left: cleanLeft,
        right: cleanRight,
        imagePrompt: imagePrompt.trim() || `child-friendly workbook illustration of ${cleanRight}, white background`,
        imageAlt: imageAlt.trim() || cleanRight,
      };
    })
    .filter((pair) => pair.left && pair.right);
}

function formatMatchingPairs(pairs: MaterialEditorBlock["pairs"]): string {
  return (pairs ?? [])
    .map((pair) => [pair.left, pair.right, pair.imagePrompt, pair.imageAlt].filter(Boolean).join(" | "))
    .join("\n");
}

function splitMaterialLine(value: string, maxParts: number): string[] {
  const separator = value.includes("|") ? "|" : ";";
  return value.split(separator).slice(0, maxParts);
}

function normalizeMaterialBlockType(value: string): MaterialBlockType | null {
  const allowed: MaterialBlockType[] = [
    "text",
    "image",
    "videoEmbed",
    "flashcards",
    "fillGaps",
    "multipleChoice",
    "matchingPairs",
    "freeWriting",
    "speakingPrompt",
    "drawingArea",
    "generatedImage",
  ];

  return allowed.includes(value as MaterialBlockType) ? value as MaterialBlockType : null;
}

function asJsonObject(value: unknown): LessonMaterialJson {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as LessonMaterialJson;
  }

  return {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asPositiveNumber(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function createClientId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  return `${prefix}-${randomId}`;
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

function upsertScheduledLesson(current: ScheduledLesson[], lesson: ScheduledLesson): ScheduledLesson[] {
  if (current.some((item) => item.id === lesson.id)) {
    return current.map((item) => (item.id === lesson.id ? lesson : item));
  }

  return [lesson, ...current];
}

function roomSessionFromScheduledLesson(
  session: LessonRoomSession,
  lesson: ScheduledLesson,
): LessonRoomSession {
  return {
    ...session,
    courseTitle: lesson.courseTitle ?? session.courseTitle,
    lessonEndsAt: lesson.scheduledEnd ?? null,
    lessonStartsAt: lesson.scheduledStart ?? null,
    lessonStatus: lesson.status,
    lessonTemplateId: lesson.lessonTemplateId ?? null,
    lessonTitle: lesson.lessonTitle ?? lesson.courseTitle ?? session.lessonTitle,
    lessonType: lesson.type,
    materialId: lesson.materialId ?? null,
    participants: lesson.participants,
    teacherName: lesson.teacherName ?? session.teacherName,
  };
}

function buildLessonRealtimeUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/ws/lessons`;
}

function formatDateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "время позже";
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 КБ";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
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

function isRoomSessionExpired(session: LessonRoomSession, nowMs = Date.now()): boolean {
  if (isClosedScheduleStatus(session.lessonStatus)) {
    return true;
  }

  const endMs = dateValueMs(session.lessonEndsAt);
  return endMs !== null && endMs <= nowMs;
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

function emptyAnnotationContent(): { schemaVersion: 1; strokes: AnnotationStroke[] } {
  return { schemaVersion: 1, strokes: [] };
}

function annotationContentFromStrokes(strokes: AnnotationStroke[]): LessonMaterialJson {
  return {
    schemaVersion: 1,
    strokes: strokes.map((stroke) => ({
      color: stroke.color,
      id: stroke.id,
      points: stroke.points.map((point) => ({
        x: Number(point.x.toFixed(1)),
        y: Number(point.y.toFixed(1)),
      })),
    })),
  };
}

function annotationContentFromJson(value: unknown): { schemaVersion: 1; strokes: AnnotationStroke[] } {
  const root = asJsonObject(value);
  const strokes = Array.isArray(root.strokes)
    ? root.strokes
        .map((stroke) => annotationStrokeFromJson(stroke))
        .filter((stroke): stroke is AnnotationStroke => stroke !== null)
    : [];

  return { schemaVersion: 1, strokes };
}

function annotationStrokeFromJson(value: unknown): AnnotationStroke | null {
  const stroke = asJsonObject(value);
  const id = asString(stroke.id).trim();
  const color = asString(stroke.color).trim() || "#ff5c00";
  const rawPoints = Array.isArray(stroke.points) ? stroke.points : [];
  const points = rawPoints
    .map((point) => {
      const pointObject = asJsonObject(point);
      const x = asNumber(pointObject.x);
      const y = asNumber(pointObject.y);
      return x === null || y === null ? null : { x, y };
    })
    .filter((point): point is AnnotationPoint => point !== null);

  if (!id || points.length === 0) {
    return null;
  }

  return { color, id, points };
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

function workspaceTabsForProfile(profile: MeProfile | null): Array<{ id: WorkspaceTab; label: string; description: string }> {
  const scheduleTab = {
    id: "schedule" as const,
    label: canAssignLessons(profile) ? "Уроки" : "Мои уроки",
    description: canAssignLessons(profile) ? "расписание и вход" : "ближайшие занятия",
  };

  if (!canAssignLessons(profile)) {
    return [scheduleTab];
  }

  return [
    scheduleTab,
    { id: "materials", label: "Материалы", description: "конструктор уроков" },
    { id: "courses", label: "Курсы", description: "программы и шаблоны" },
  ];
}

function workspaceTabIcon(tab: WorkspaceTab): ReactNode {
  switch (tab) {
    case "materials":
      return <BookOpen className="h-4 w-4" />;
    case "courses":
      return <Layers3 className="h-4 w-4" />;
    case "schedule":
    default:
      return <CalendarDays className="h-4 w-4" />;
  }
}

function materialSubmissionUserLabel(submission: LessonMaterialSubmission): string {
  return submission.userName?.trim() || submission.userSubject?.trim() || "Ученик";
}

function averageSubmissionScore(submissions: LessonMaterialSubmission[]): number | null {
  const scores = submissions
    .map((submission) => submission.score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

  if (scores.length === 0) {
    return null;
  }

  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function materialSubmissionAssessmentSummary(submission: LessonMaterialSubmission): { hints: number; label: string; retries: number } {
  const assessment = asJsonObject(asJsonObject(submission.content).assessment);
  const items = Array.isArray(assessment.items) ? assessment.items.map(asJsonObject) : [];
  const hints = items.reduce((total, item) => total + (asNumber(item.hintsUsed) ?? 0), 0);
  const retries = items.reduce((total, item) => total + Math.max(0, (asNumber(item.attemptsUsed) ?? 0) - 1), 0);
  const errors = asNumber(assessment.errorsCount) ?? submission.errorsCount ?? 0;
  return {
    hints,
    retries,
    label: `${errors} ошибок, ${hints} подсказок, ${retries} дополнительных попыток`,
  };
}

function formatMaterialScore(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "10";
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function formatSubmissionTime(value: string | null | undefined): string {
  if (!value) {
    return "черновик";
  }

  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function participantDisplayName(trackRef: ClassroomTrackReference): string {
  return (
    trackRef.participant.name?.trim()
    || trackRef.participant.identity?.trim()
    || "Участник"
  );
}

function classroomTrackKey(trackRef: ClassroomTrackReference): string {
  return `${trackRef.participant.sid || trackRef.participant.identity}-${trackRef.source ?? "camera"}`;
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
