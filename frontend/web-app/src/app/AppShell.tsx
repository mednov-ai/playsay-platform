import { lazy, Suspense, useCallback, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import { publicSiteUrl } from "@playsay/shared-ui";
import { CalendarPlus, Loader2, LogIn, LogOut, Play, User, UserPlus, Video } from "lucide-react";
import { type WorkspaceTab, type WorkspaceTabDefinition } from "../entities/workspace/model";
import { nextTeacherActionLesson, type CourseLessonMap } from "../entities/schedule/model";
import {
  startLogin,
  type AdminUserProfile,
  type AppUserProfile,
  type Course,
  type CourseInput,
  type CourseLesson,
  type CourseLessonInput,
  type CurriculumTopic,
  type CurriculumTopicInput,
  type LessonMaterial,
  type LessonMaterialAnswerSuggestions,
  type LessonMaterialAnswerSuggestionsInput,
  type LessonMaterialAsset,
  type LessonMaterialAssetUpdateInput,
  type LessonMaterialDraft,
  type LessonMaterialDraftInput,
  type LessonMaterialGenerateImagesInput,
  type LessonMaterialInput,
  type LessonTemplateCardsInput,
  type LessonMaterialUrlDraftInput,
  type ManagedStudentInput,
  type MeProfile,
  type PaymentInvoice,
  type PaymentInvoiceCreateInput,
  type PaymentInvoiceCreated,
  type ScheduledLesson,
  type ScheduledLessonInput,
  type ScheduledLessonScheduleInput,
  type UpdateUserProfileInput,
} from "../shared/api/playsay";
import { BrandMark } from "../shared/ui/BrandMark";
import { WorkspaceTabs } from "../widgets/workspace-tabs/WorkspaceTabs";
import { Button } from "../components/ui/button";
import type { SessionStatus } from "../features/profile/ui/ProfileAccountPanel";
import type { ClassroomMediaChoices, LessonRoomSession } from "../features/classroom";
import { useAppTranslation } from "../shared/i18n";
import { LanguageSwitcher } from "../shared/i18n/ui/LanguageSwitcher";
import officialLogoUrl from "../shared/assets/playsay-official-logo.jpg";
import { ThemeToggle } from "../shared/theme/ThemeToggle";
import { useAppTheme } from "./AppProviders";
import { profilePath } from "./routes";

const BillingPanel = lazy(() => import("../features/payments/ui/BillingPanel").then((module) => ({ default: module.BillingPanel })));
const CourseWorkspacePanel = lazy(() => (
  import("../features/courses/ui/CourseWorkspacePanel").then((module) => ({ default: module.CourseWorkspacePanel }))
));
const HomeworkPanel = lazy(() => import("../features/homework/ui/HomeworkPanel").then((module) => ({ default: module.HomeworkPanel })));
const LiveLessonExperience = lazy(() => (
  import("../features/classroom/ui/LiveLessonExperience").then((module) => ({ default: module.LiveLessonExperience }))
));
const ClassroomPreJoin = lazy(() => (
  import("../features/classroom/ui/ClassroomPreJoin").then((module) => ({ default: module.ClassroomPreJoin }))
));
const MaterialLibraryPanel = lazy(() => (
  import("../features/materials/ui/MaterialLibraryPanel").then((module) => ({ default: module.MaterialLibraryPanel }))
));
const ProfileAccountPanel = lazy(() => (
  import("../features/profile/ui/ProfileAccountPanel").then((module) => ({ default: module.ProfileAccountPanel }))
));
const SchedulePanel = lazy(() => import("../features/schedule/ui/SchedulePanel").then((module) => ({ default: module.SchedulePanel })));
const LessonPreparationPanel = lazy(() => import("../features/schedule/ui/LessonPreparationPanel").then((module) => ({ default: module.LessonPreparationPanel })));
const AiTutorPanel = lazy(() => import("../features/ai-tutor/ui/AiTutorPanel").then((module) => ({ default: module.AiTutorPanel })));
const VocabularyPanel = lazy(() => import("../features/vocabulary/ui/VocabularyPanel").then((module) => ({ default: module.VocabularyPanel })));
const TeacherStudentsPanel = lazy(() => import("../features/user-management/ui/TeacherStudentsPanel").then((module) => ({ default: module.TeacherStudentsPanel })));
const AdminUsersPanel = lazy(() => import("../features/user-management/ui/AdminUsersPanel").then((module) => ({ default: module.AdminUsersPanel })));
const EmailDeliveriesPanel = lazy(() => import("../features/email-deliveries/ui/EmailDeliveriesPanel").then((module) => ({ default: module.EmailDeliveriesPanel })));
const GlobalToolsRail = lazy(() => import("../features/chat/ui/GlobalToolsRail").then((module) => ({ default: module.GlobalToolsRail })));

export type AppShellProps = {
  adminLoading: boolean;
  adminMessage: string | null;
  adminUsers: AdminUserProfile[];
  anyLessonLoading: boolean;
  appProfile: AppUserProfile | null;
  assignMaterialToScheduledLesson: (lessonId: string, materialId: string | null) => Promise<ScheduledLesson | null>;
  cancelScheduledLesson: (lesson: ScheduledLesson) => Promise<void>;
  classroomLesson: ScheduledLesson | null;
  completeScheduledLesson: (lessonId: string) => Promise<void>;
  confirmScheduledLessonJoin: (lesson: ScheduledLesson, mediaChoices: ClassroomMediaChoices) => Promise<void>;
  copyScheduledLessonLinks: (lesson: ScheduledLesson) => Promise<boolean>;
  courseLessons: CourseLessonMap;
  courseLoading: boolean;
  courseMessage: string | null;
  courseTopics: Record<string, CurriculumTopic[]>;
  courses: Course[];
  createCourse: (input: CourseInput) => Promise<void>;
  createLesson: (courseId: string, input: CourseLessonInput) => Promise<void>;
  createTopic: (courseId: string, input: CurriculumTopicInput) => Promise<CurriculumTopic | null>;
  createScheduledLesson: (input: ScheduledLessonInput) => Promise<ScheduledLesson | null | void>;
  createManagedStudent: (input: ManagedStudentInput) => Promise<AdminUserProfile | null>;
  deleteCourse: (courseId: string) => Promise<void>;
  deleteLesson: (courseId: string, lessonId: string) => Promise<void>;
  deleteMaterial: (materialId: string) => Promise<void>;
  deleteTopic: (courseId: string, topicId: string) => Promise<void>;
  deleteScheduledLesson: (lessonId: string) => Promise<void>;
  error: string | null;
  generateImagesForMaterial: (materialId: string, input: LessonMaterialGenerateImagesInput) => Promise<LessonMaterial | null>;
  generateMaterialDraft: (input: LessonMaterialDraftInput) => Promise<LessonMaterialDraft | null>;
  generateMaterialDraftFromUrl: (input: LessonMaterialUrlDraftInput) => Promise<LessonMaterialDraft | null>;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isClassroomOpen: boolean;
  isProfileRoute: boolean;
  joinScheduledLesson: (lesson: ScheduledLesson, options?: { updateRoute?: boolean }) => Promise<void>;
  leaveScheduledLessonRoom: () => void;
  linkMaterialToCourseLesson: (courseId: string, lesson: CourseLesson, materialId: string | null) => Promise<void>;
  logout: () => void;
  materialLoading: boolean;
  materialMessage: string | null;
  materials: LessonMaterial[];
  nextJoinableLesson: ScheduledLesson | null;
  nextLessonLoading: boolean;
  nowMs: number;
  paymentInvoices: PaymentInvoice[];
  paymentLoading: boolean;
  paymentMessage: string | null;
  preparationLessonId?: string | null;
  profile: MeProfile | null;
  profileMessage: string | null;
  profileSaving: boolean;
  refreshAdminUsers: () => Promise<void>;
  refreshCourses: () => Promise<void>;
  refreshMaterials: () => Promise<void>;
  refreshPaymentInvoices: () => Promise<void>;
  refreshSchedule: () => Promise<void>;
  rescheduleScheduledLesson?: (lessonId: string, input: ScheduledLessonScheduleInput) => Promise<ScheduledLesson | null>;
  resetProfile: () => Promise<void>;
  roomLoadingLessonId: string | null;
  roomMessage: string | null;
  roomSession: LessonRoomSession | null;
  saveProfile: (input: UpdateUserProfileInput) => Promise<void>;
  scheduleLoading: boolean;
  scheduleMessage: string | null;
  scheduledLessons: ScheduledLesson[];
  setWorkspaceTab: Dispatch<SetStateAction<WorkspaceTab>>;
  status: SessionStatus;
  startScheduledLesson?: (lesson: ScheduledLesson) => Promise<void>;
  studentUsers: AdminUserProfile[];
  replaceLessonCards: (courseId: string, lessonId: string, input: LessonTemplateCardsInput) => Promise<void>;
  createPaymentInvoice: (input: PaymentInvoiceCreateInput) => Promise<PaymentInvoiceCreated | null>;
  suggestAcceptedAnswersForMaterial: (materialId: string, input: LessonMaterialAnswerSuggestionsInput) => Promise<LessonMaterialAnswerSuggestions | null>;
  updateMaterialAssetMetadata: (materialId: string, assetId: string, input: LessonMaterialAssetUpdateInput) => Promise<LessonMaterialAsset | null>;
  updateTopic: (courseId: string, topicId: string, input: CurriculumTopicInput) => Promise<void>;
  upsertMaterial: (input: LessonMaterialInput, materialId?: string) => Promise<LessonMaterial | null>;
  workspaceTab: WorkspaceTab;
  workspaceTabs: WorkspaceTabDefinition[];
  openProfile: () => void;
  closeProfile: () => void;
  openLessonPreparation?: (lessonId: string) => void;
  closeLessonPreparation?: () => void;
};

export function AppShell(props: AppShellProps) {
  const { t } = useAppTranslation();
  const theme = useAppTheme();
  const [materialAuthoringState, setMaterialAuthoringState] = useState({ dirty: false, focused: false });
  const {
    adminLoading,
    adminMessage,
    adminUsers,
    anyLessonLoading,
    appProfile,
    assignMaterialToScheduledLesson,
    cancelScheduledLesson,
    classroomLesson,
    completeScheduledLesson,
    confirmScheduledLessonJoin,
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
    deleteLesson,
    deleteMaterial,
    deleteTopic,
    deleteScheduledLesson,
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
    preparationLessonId = null,
    profile,
    profileMessage,
    profileSaving,
    refreshAdminUsers,
    refreshCourses,
    refreshMaterials,
    refreshPaymentInvoices,
    refreshSchedule,
    rescheduleScheduledLesson = async () => null,
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
    startScheduledLesson = async () => undefined,
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
    openLessonPreparation = () => undefined,
    closeLessonPreparation = () => undefined,
  } = props;
  const canManageSchedule = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  const preparationLesson = preparationLessonId
    ? scheduledLessons.find((lesson) => lesson.id === preparationLessonId) ?? null
    : null;
  const teacherActionLesson = canManageSchedule
    ? nextTeacherActionLesson(scheduledLessons, nowMs)
    : null;
  const headerTeacherActionLesson = preparationLessonId === teacherActionLesson?.id ? null : teacherActionLesson;
  const hasGlobalTools = Boolean(
    isAuthenticated &&
    profile &&
    profile.roles.some((role) => role === "TEACHER" || role === "STUDENT"),
  );

  const handleMaterialAuthoringStateChange = useCallback((state: { dirty: boolean; focused: boolean }) => {
    setMaterialAuthoringState((current) => (
      current.dirty === state.dirty && current.focused === state.focused ? current : state
    ));
  }, []);

  function selectWorkspaceTab(nextTab: WorkspaceTab) {
    if (nextTab === workspaceTab) {
      return;
    }
    if (materialAuthoringState.dirty && !window.confirm(t("materials.editor.unsavedConfirm"))) {
      return;
    }
    setMaterialAuthoringState({ dirty: false, focused: false });
    setWorkspaceTab(nextTab);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }

  function focusScheduleCreateForm() {
    setWorkspaceTab("schedule");
    const dispatchOpenWizard = () => {
      window.dispatchEvent(new CustomEvent("playsay:assign-lesson"));
    };
    if (isProfileRoute) {
      closeProfile();
      window.requestAnimationFrame(() => window.requestAnimationFrame(dispatchOpenWizard));
      return;
    }
    window.requestAnimationFrame(dispatchOpenWizard);
  }

  function handleProfileNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    openProfile();
  }

  return (
    <main
      className={`${isClassroomOpen ? "h-dvh overflow-hidden" : "min-h-screen overflow-hidden"} bg-background text-foreground`}
      data-playsay-tools-layout={hasGlobalTools ? "true" : undefined}
    >
      {hasGlobalTools && profile ? (
        <Suspense fallback={null}>
          <GlobalToolsRail profile={profile} />
        </Suspense>
      ) : null}
      <section
        className={`mx-auto flex w-full flex-col ${
          isClassroomOpen
            ? "h-full max-w-[92rem] gap-3 px-3 py-3 sm:px-4"
            : `min-h-screen ${materialAuthoringState.focused ? "max-w-[92rem]" : "max-w-6xl"} gap-7 px-5 py-6 sm:px-8`
        }`}
      >
        {isClassroomOpen || !isAuthenticated ? null : (
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <BrandMark />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <ThemeToggle mode={theme.mode} onModeChange={theme.setMode} resolvedTheme={theme.resolvedTheme} />
              {!canManageSchedule && nextJoinableLesson ? (
                <Button
                  className="min-w-40"
                  disabled={anyLessonLoading}
                  onClick={() => {
                    void joinScheduledLesson(nextJoinableLesson);
                  }}
                  type="button"
                >
                  {nextLessonLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  {t("shell.actions.joinLesson")}
                </Button>
              ) : canManageSchedule && headerTeacherActionLesson ? (
                <Button
                  className="min-w-40 playsay-lesson-invite"
                  data-lesson-invite-location="header"
                  disabled={anyLessonLoading}
                  onClick={() => {
                    if (headerTeacherActionLesson.status === "IN_PROGRESS") {
                      void joinScheduledLesson(headerTeacherActionLesson);
                    } else {
                      void startScheduledLesson(headerTeacherActionLesson);
                    }
                  }}
                  type="button"
                >
                  {roomLoadingLessonId === headerTeacherActionLesson.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : headerTeacherActionLesson.status === "IN_PROGRESS"
                      ? <Video className="h-4 w-4" />
                      : <Play className="h-4 w-4" />}
                  {headerTeacherActionLesson.status === "IN_PROGRESS"
                    ? t("shell.actions.joinLesson")
                    : t("schedule.actions.start")}
                </Button>
              ) : canManageSchedule ? (
                <Button
                  className="min-w-40"
                  onClick={focusScheduleCreateForm}
                  type="button"
                >
                  <CalendarPlus className="h-4 w-4" />
                  {t("schedule.wizard.assign")}
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <a
                  aria-current={isProfileRoute ? "page" : undefined}
                  className={isProfileRoute ? "border-primary bg-primary/10 text-primary shadow-sm hover:bg-primary/15" : undefined}
                  href={profilePath()}
                  onClick={handleProfileNavigation}
                >
                  <User className="h-4 w-4" />
                  {t("shell.actions.profile")}
                </a>
              </Button>
              <Button aria-label={t("shell.aria.logout")} variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4" />
                {t("auth.logout")}
              </Button>
            </div>
          </header>
        )}

        {roomSession ? (
          <Suspense fallback={<PanelFallback />}>
            <LiveLessonExperience
              materials={materials}
              onAssignMaterial={(lessonId, materialId) => assignMaterialToScheduledLesson(lessonId, materialId)}
              onComplete={() => void completeScheduledLesson(roomSession.lessonId)}
              onLeave={leaveScheduledLessonRoom}
              profile={profile}
              session={roomSession}
            />
          </Suspense>
        ) : classroomLesson ? (
          <Suspense fallback={<PanelFallback />}>
            <ClassroomPreJoin
              joining={roomLoadingLessonId === classroomLesson.id}
              lesson={classroomLesson}
              message={roomMessage}
              onBack={leaveScheduledLessonRoom}
              onJoin={(choices) => confirmScheduledLessonJoin(classroomLesson, choices)}
            />
          </Suspense>
        ) : !isAuthenticated ? (
          <WelcomeLanding profileSaving={profileSaving} status={status} />
        ) : isProfileRoute ? (
          <div className="grid flex-1">
            <Suspense fallback={<PanelFallback />}>
              <ProfileAccountPanel
                adminLoading={adminLoading}
                adminMessage={adminMessage}
                adminUsers={adminUsers}
                appProfile={appProfile}
                error={error}
                isAdmin={isAdmin}
                isAuthenticated={isAuthenticated}
                onBack={closeProfile}
                onRefreshAdminUsers={() => void refreshAdminUsers()}
                onResetProfile={() => void resetProfile()}
                onSaveProfile={saveProfile}
                profile={profile}
                profileMessage={profileMessage}
                profileSaving={profileSaving}
                status={status}
              />
            </Suspense>
          </div>
        ) : preparationLesson && canManageSchedule ? (
          <Suspense fallback={<PanelFallback />}>
            <LessonPreparationPanel
              disabled={scheduleLoading || roomLoadingLessonId === preparationLesson.id}
              lesson={preparationLesson}
              materials={materials}
              message={roomMessage ?? scheduleMessage}
              onAssignMaterial={assignMaterialToScheduledLesson}
              onBack={closeLessonPreparation}
              onCopyLinks={copyScheduledLessonLinks}
              onOpenMaterials={() => {
                closeLessonPreparation();
                setWorkspaceTab("materials");
              }}
              onStart={startScheduledLesson}
            />
          </Suspense>
        ) : (
          <div className="grid flex-1 gap-5">
            <Suspense fallback={<PanelFallback />}>
              {workspaceTabs.length > 1 && !materialAuthoringState.focused ? (
                <WorkspaceTabs activeTab={workspaceTab} onSelect={selectWorkspaceTab} tabs={workspaceTabs} />
              ) : null}

              {workspaceTab === "schedule" ? (
                <SchedulePanel
                  courses={courses}
                  disabled={!isAuthenticated || scheduleLoading}
                  lessons={courseLessons}
                  loading={scheduleLoading}
                  materials={materials}
                  message={scheduleMessage}
                  nowMs={nowMs}
                  onCancel={(lesson) => void cancelScheduledLesson(lesson)}
                  onComplete={(lesson) => void completeScheduledLesson(lesson.id)}
                  onCreate={createScheduledLesson}
                  onCreateManagedStudent={createManagedStudent}
                  onDelete={(lessonId) => void deleteScheduledLesson(lessonId)}
                  onCopyLinks={(lesson) => copyScheduledLessonLinks(lesson)}
                  onJoin={(lesson) => void joinScheduledLesson(lesson)}
                  onOpenMaterials={() => setWorkspaceTab("materials")}
                  onPrepare={openLessonPreparation}
                  onStart={(lesson) => void startScheduledLesson(lesson)}
                  onRefresh={() => void refreshSchedule()}
                  onReschedule={rescheduleScheduledLesson}
                  profile={profile}
                  roomLoadingLessonId={roomLoadingLessonId}
                  roomMessage={roomMessage}
                  scheduledLessons={scheduledLessons}
                  studentUsers={studentUsers}
                />
              ) : null}

              {workspaceTab === "homework" ? (
                <HomeworkPanel
                  disabled={!isAuthenticated}
                  materials={materials}
                  profile={profile}
                  scheduledLessons={scheduledLessons}
                  studentUsers={studentUsers}
                />
              ) : null}

              {workspaceTab === "aiTutor" ? (
                <AiTutorPanel appProfile={appProfile} onOpenProfile={openProfile} />
              ) : null}

              {workspaceTab === "vocabulary" ? <VocabularyPanel /> : null}

              {workspaceTab === "students" ? <TeacherStudentsPanel /> : null}

              {workspaceTab === "users" ? <AdminUsersPanel /> : null}

              {workspaceTab === "emails" ? <EmailDeliveriesPanel /> : null}

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
                  onSuggestAcceptedAnswers={(materialId, input) => suggestAcceptedAnswersForMaterial(materialId, input)}
                  onUpdateAsset={(materialId, assetId, input) => updateMaterialAssetMetadata(materialId, assetId, input)}
                  onLinkLesson={(courseId, lesson, materialId) => void linkMaterialToCourseLesson(courseId, lesson, materialId)}
                  onRefresh={() => void refreshMaterials()}
                  onSave={(input, materialId) => upsertMaterial(input, materialId)}
                  onAuthoringStateChange={handleMaterialAuthoringStateChange}
                  profile={profile}
                  workspaceNavigation={workspaceTabs.length > 1 ? (
                    <WorkspaceTabs
                      activeTab={workspaceTab}
                      onSelect={selectWorkspaceTab}
                      tabs={workspaceTabs}
                      variant="editor"
                    />
                  ) : null}
                />
              ) : null}

              {workspaceTab === "courses" ? (
                <CourseWorkspacePanel
                  courses={courses}
                  disabled={!isAuthenticated || courseLoading}
                  lessons={courseLessons}
                  loading={courseLoading}
                  materials={materials}
                  message={courseMessage}
                  onCreateCourse={(input) => void createCourse(input)}
                  onCreateLesson={(courseId, input) => void createLesson(courseId, input)}
                  onCreateTopic={createTopic}
                  onDeleteCourse={(courseId) => void deleteCourse(courseId)}
                  onDeleteLesson={(courseId, lessonId) => void deleteLesson(courseId, lessonId)}
                  onDeleteTopic={(courseId, topicId) => void deleteTopic(courseId, topicId)}
                  onRefresh={() => void refreshCourses()}
                  onReplaceLessonCards={(courseId, lessonId, input) => void replaceLessonCards(courseId, lessonId, input)}
                  onUpdateTopic={(courseId, topicId, input) => void updateTopic(courseId, topicId, input)}
                  profile={profile}
                  topics={courseTopics}
                />
              ) : null}

              {workspaceTab === "billing" ? (
                <BillingPanel
                  disabled={!isAuthenticated || paymentLoading}
                  invoices={paymentInvoices}
                  loading={paymentLoading}
                  message={paymentMessage}
                  onCreate={createPaymentInvoice}
                  onRefresh={() => void refreshPaymentInvoices()}
                />
              ) : null}
            </Suspense>
          </div>
        )}
      </section>
    </main>
  );
}

function PanelFallback() {
  return <div aria-hidden="true" className="min-h-40" />;
}

export function WelcomeLanding({
  profileSaving,
  status,
}: {
  profileSaving: boolean;
  status: SessionStatus;
}) {
  const { t } = useAppTranslation();
  const theme = useAppTheme();
  const isBusy = status === "checking" || status === "loggingOut";

  return (
    <div className="playsay-welcome-scene" aria-busy={isBusy}>
      <div className="playsay-welcome-motion" aria-hidden="true">
        <span className="playsay-floating-ball playsay-floating-ball-one" />
        <span className="playsay-floating-ball playsay-floating-ball-two" />
        <span className="playsay-floating-ball playsay-floating-ball-three" />
        <span className="playsay-floating-ball playsay-floating-ball-four" />
        <span className="playsay-handprint playsay-handprint-one">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span className="playsay-handprint playsay-handprint-two">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span className="playsay-handprint playsay-handprint-three">
          <span />
          <span />
          <span />
          <span />
        </span>
      </div>

      <div className="playsay-welcome-content">
        <a className="playsay-welcome-logo-link" href={publicSiteUrl} aria-label={t("welcome.logoLinkAria")}>
          <PlaySayAnimatedLogo label={t("common.appName")} />
        </a>
        <div className="playsay-welcome-actions">
          <div className="playsay-welcome-preferences">
            <LanguageSwitcher
              className="playsay-welcome-language"
              disabled={profileSaving || isBusy}
            />
            <ThemeToggle className="playsay-theme-toggle" mode={theme.mode} onModeChange={theme.setMode} resolvedTheme={theme.resolvedTheme} />
          </div>
          <button
            className="playsay-welcome-login"
            disabled={isBusy}
            onClick={() => void startLogin()}
            type="button"
          >
            {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
            <span>{t("auth.login")}</span>
          </button>
          <a className="playsay-welcome-register" href="/register">
            <UserPlus className="h-4 w-4" />
            <span>{t("registration.actions.create")}</span>
          </a>
          <a className="playsay-welcome-return" href={publicSiteUrl}>
            {t("welcome.returnToSite")}
          </a>
        </div>
      </div>
    </div>
  );
}

function PlaySayAnimatedLogo({ label }: { label: string }) {
  return (
    <svg
      aria-label={label}
      className="playsay-welcome-logo"
      role="img"
      viewBox="0 0 420 420"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="playsay-welcome-logo-clip">
          <path d="M74 38C117 21 187 25 239 30C310 37 365 61 386 111C410 168 397 252 371 310C344 370 281 404 203 401C123 398 57 367 33 307C10 250 23 169 35 113C45 69 53 47 74 38Z" />
        </clipPath>
        <linearGradient id="playsay-welcome-logo-shine" x1="-30%" x2="130%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#ff5c00" stopOpacity="0" />
          <stop offset="35%" stopColor="#ffd84d" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="65%" stopColor="#74dbbe" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#ff5c00" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g clipPath="url(#playsay-welcome-logo-clip)">
        <rect className="playsay-welcome-logo-paper" height="420" width="420" />
        <image
          className="playsay-welcome-logo-art"
          height="456"
          href={officialLogoUrl}
          preserveAspectRatio="xMidYMid meet"
          width="456"
          x="-28"
          y="-18"
        />
        <rect
          className="playsay-welcome-logo-shine"
          fill="url(#playsay-welcome-logo-shine)"
          height="560"
          width="190"
          x="-240"
          y="-80"
        />
      </g>
      <path
        className="playsay-welcome-logo-outline"
        d="M74 38C117 21 187 25 239 30C310 37 365 61 386 111C410 168 397 252 371 310C344 370 281 404 203 401C123 398 57 367 33 307C10 250 23 169 35 113C45 69 53 47 74 38Z"
      />
    </svg>
  );
}
