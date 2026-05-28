import type { Dispatch, SetStateAction } from "react";
import { Loader2, LogIn, LogOut, User, Video } from "lucide-react";
import { type WorkspaceTab, type WorkspaceTabDefinition } from "../entities/workspace/model";
import type { CourseLessonMap } from "../entities/schedule/model";
import {
  startLogin,
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
import { BrandMark } from "../shared/ui/BrandMark";
import { WorkspaceTabs } from "../widgets/workspace-tabs/WorkspaceTabs";
import { Button } from "../components/ui/button";
import { ProfileAccountPanel, type SessionStatus } from "../features/profile/ui/ProfileAccountPanel";
import { CourseWorkspacePanel } from "../features/courses/ui/CourseWorkspacePanel";
import { SchedulePanel } from "../features/schedule/ui/SchedulePanel";
import type { LessonRoomSession } from "../features/classroom";
import { MaterialLibraryPanel } from "../features/materials/ui/MaterialLibraryPanel";
import { LiveLessonExperience } from "../features/classroom/ui/LiveLessonExperience";

export type AppShellProps = {
  adminLoading: boolean;
  adminMessage: string | null;
  adminUsers: AdminUserProfile[];
  anyLessonLoading: boolean;
  appProfile: AppUserProfile | null;
  assignMaterialToScheduledLesson: (lessonId: string, materialId: string | null) => Promise<ScheduledLesson | null>;
  cancelScheduledLesson: (lesson: ScheduledLesson) => Promise<void>;
  courseLessons: CourseLessonMap;
  courseLoading: boolean;
  courseMessage: string | null;
  courses: Course[];
  createCourse: (input: CourseInput) => Promise<void>;
  createLesson: (courseId: string, input: CourseLessonInput) => Promise<void>;
  createScheduledLesson: (input: ScheduledLessonInput) => Promise<void>;
  deleteCourse: (courseId: string) => Promise<void>;
  deleteLesson: (courseId: string, lessonId: string) => Promise<void>;
  deleteMaterial: (materialId: string) => Promise<void>;
  deleteScheduledLesson: (lessonId: string) => Promise<void>;
  error: string | null;
  generateImagesForMaterial: (materialId: string, input: LessonMaterialGenerateImagesInput) => Promise<LessonMaterial | null>;
  generateMaterialDraft: (input: LessonMaterialDraftInput) => Promise<LessonMaterialDraft | null>;
  generateMaterialDraftFromUrl: (input: LessonMaterialUrlDraftInput) => Promise<LessonMaterialDraft | null>;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isClassroomOpen: boolean;
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
  profile: MeProfile | null;
  profileMessage: string | null;
  profileOpen: boolean;
  profileSaving: boolean;
  refreshAdminUsers: () => Promise<void>;
  refreshCourses: () => Promise<void>;
  refreshMaterials: () => Promise<void>;
  refreshSchedule: () => Promise<void>;
  resetProfile: () => Promise<void>;
  roomLoadingLessonId: string | null;
  roomMessage: string | null;
  roomSession: LessonRoomSession | null;
  saveProfile: (input: UpdateUserProfileInput) => Promise<void>;
  scheduleLoading: boolean;
  scheduleMessage: string | null;
  scheduledLessons: ScheduledLesson[];
  setProfileOpen: Dispatch<SetStateAction<boolean>>;
  setWorkspaceTab: Dispatch<SetStateAction<WorkspaceTab>>;
  status: SessionStatus;
  studentUsers: AdminUserProfile[];
  updateMaterialAssetMetadata: (materialId: string, assetId: string, input: LessonMaterialAssetUpdateInput) => Promise<LessonMaterialAsset | null>;
  upsertMaterial: (input: LessonMaterialInput, materialId?: string) => Promise<LessonMaterial | null>;
  workspaceTab: WorkspaceTab;
  workspaceTabs: WorkspaceTabDefinition[];
};

export function AppShell(props: AppShellProps) {
  const {
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
  } = props;

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
                onUpdateAsset={(materialId, assetId, input) => updateMaterialAssetMetadata(materialId, assetId, input)}
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
