import { BookOpen, Clock3, Eye, Loader2, PanelRight, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { canAssignLessons } from "../../../entities/workspace/model";
import { formatLessonRange, formatParticipantCount } from "../../../entities/schedule/model";
import {
  type LessonMaterial,
  type MeProfile,
  type ScheduledLesson,
  createVocabularyPractice,
} from "../../../shared/api/playsay";
import { useCollaborationDocument } from "../hooks/useCollaborationDocument";
import { useLessonMaterial } from "../hooks/useLessonMaterial";
import { useLessonSubmission } from "../hooks/useLessonSubmission";
import { useYjsWorkspace } from "../hooks/useYjsWorkspace";
import { useExternalActivitySession } from "../hooks/useExternalActivitySession";
import { collaborationParticipantColor } from "../model/collaboration";
import type { LessonRoomSession } from "../model/session";
import {
  acknowledgeStudentHealth,
  studentHealthViews,
  updateStudentHealthState,
  type StudentHealthState,
} from "../model/studentHealth";
import {
  AssignmentStub,
  averageSubmissionScore,
  materialBlockLabel,
  materialDocumentBlocks,
} from "../../materials";
import { LessonTaskCanvas, type LessonPresentationMode } from "./LessonTaskCanvas";
import { MaterialSubmissionsMonitor } from "./MaterialSubmissionsMonitor";
import { StudentLiveWorkspace } from "./StudentLiveWorkspace";
import { TeacherLessonToolbar } from "./TeacherLessonToolbar";
import { useAppTranslation } from "../../../shared/i18n";
import { VocabularyLessonDialog } from "../../vocabulary/ui/VocabularyLessonDialog";
import { VocabularyLiveStage } from "../../vocabulary/ui/VocabularyLiveStage";
import { useLiveVocabularyPractice } from "../../vocabulary/hooks/useLiveVocabularyPractice";
import { vocabularyFeatures } from "../../../shared/config/vocabularyFeatures";
import { LessonActivityRail } from "./LessonActivityRail";

export function LessonWorkspace({
  displayName,
  materials,
  onAssignMaterial,
  onPresentationModeChange,
  presentationMode,
  profile,
  session,
}: {
  displayName: string;
  materials: LessonMaterial[];
  onAssignMaterial: (lessonId: string, materialId: string | null) => Promise<ScheduledLesson | null>;
  onPresentationModeChange: (mode: LessonPresentationMode) => void;
  presentationMode: LessonPresentationMode;
  profile: MeProfile | null;
  session: LessonRoomSession;
}) {
  const { t } = useAppTranslation();
  const translate = (key: string, options?: Record<string, unknown>) => t(key, options);
  const {
    assigningMaterial,
    assignmentMessage,
    assignMaterial,
    material,
    materialError,
    materialLoading,
    liveActivePageId,
    selectedMaterialId,
    setSelectedMaterialId,
    uploadImagePage,
    uploadHtmlGamePage,
    uploadingImagePage,
    uploadingHtmlGamePage,
  } = useLessonMaterial({ onAssignMaterial, session });
  const canMonitorSubmissions = canAssignLessons(profile);
  const liveVocabulary = useLiveVocabularyPractice({
    enabled: vocabularyFeatures.live,
    lessonId: session.lessonId,
    ownerSubject: canMonitorSubmissions ? undefined : profile?.subject,
  });
  const assignedParticipants = session.participants.filter((participant) => Boolean(participant.materialId));
  const isParallelWork = session.workMode === "PARALLEL" &&
    session.participants.length > 1 &&
    assignedParticipants.length === session.participants.length;
  const teacherWorkParticipants = isParallelWork ? assignedParticipants : session.participants;
  const teacherWorkParticipantKey = teacherWorkParticipants.map((participant) => participant.subject).join("|");
  const studentSharedPresenceEnabled = shouldEnableSharedMaterialPresence({
    canMonitorSubmissions,
    isParallelWork,
    workMode: session.workMode,
  });
  const canManageMaterial = canAssignLessons(profile) && !isParallelWork;
  const [activeStudentSubject, setActiveStudentSubject] = useState<string | null>(null);
  const [teacherTaskVisible, setTeacherTaskVisible] = useState(false);
  const [startingVocabularyPractice, setStartingVocabularyPractice] = useState(false);
  const [activityRailOpen, setActivityRailOpen] = useState(() => (
    vocabularyFeatures.personalPracticeV2
    && typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(min-width: 1024px)").matches
  ));

  async function startVocabularyPractice() {
    if (!canMonitorSubmissions || startingVocabularyPractice || session.participants.length === 0) return;
    setStartingVocabularyPractice(true);
    try {
      liveVocabulary.setPractice(await createVocabularyPractice({
        delivery: "LIVE",
        lessonId: session.lessonId,
        mode: "BALANCED",
        ownerSubjects: session.participants.map((participant) => participant.subject),
        wordLimit: 10,
      }));
    } finally {
      setStartingVocabularyPractice(false);
    }
  }

  useEffect(() => {
    setTeacherTaskVisible((current) => teacherTaskVisibilityAfterLiveUpload(
      current,
      canMonitorSubmissions,
      liveActivePageId,
    ));
  }, [canMonitorSubmissions, liveActivePageId]);

  const activeParticipant = canMonitorSubmissions
    ? teacherWorkParticipants.find((participant) => participant.subject === activeStudentSubject) ?? teacherWorkParticipants[0] ?? null
    : null;
  const activeAssignedMaterial = canMonitorSubmissions && isParallelWork && activeParticipant?.materialId
    ? materials.find((item) => item.id === activeParticipant.materialId) ?? null
    : null;
  const visibleMaterial = activeAssignedMaterial ?? material;
  const {
    saveMaterialAnswers,
    submission,
    submissionMessage,
    submissionMonitorError,
    submissionSaving,
    submissionSnapshots,
  } = useLessonSubmission({ canMonitorSubmissions, material: visibleMaterial, session });
  const activeStudentSubmission = canMonitorSubmissions
    ? submissionSnapshots.find((item) => item.userSubject === activeParticipant?.subject) ?? null
    : null;
  const selectableMaterials = materials.filter((item) => item.status !== "ARCHIVED");
  const lessonScore = canMonitorSubmissions && activeParticipant
    ? activeStudentSubmission?.score ?? null
    : canMonitorSubmissions
      ? averageSubmissionScore(submissionSnapshots)
      : submission?.score ?? null;
  const [studentHealthState, setStudentHealthState] = useState<StudentHealthState>({});
  const healthSubjects = assignedParticipants.map((participant) => participant.subject);
  const healthSubjectKey = healthSubjects.join("|");
  const teacherAnnotationDocumentState = useCollaborationDocument({
    enabled: canMonitorSubmissions && Boolean(visibleMaterial) && !isParallelWork,
    lessonId: session.lessonId,
    materialId: visibleMaterial?.id,
    mode: "group",
  });
  const teacherAnnotationWorkspace = useYjsWorkspace({
    color: collaborationParticipantColor(profile?.subject ?? displayName),
    document: teacherAnnotationDocumentState.document,
    enabled: canMonitorSubmissions && Boolean(teacherAnnotationDocumentState.document),
    onDocumentInvalid: teacherAnnotationDocumentState.invalidateDocument,
    participantName: displayName,
  });
  const teacherAnnotationSync = useMemo(() => {
    if (!teacherAnnotationDocumentState.document) {
      return null;
    }
    return {
      canRedo: teacherAnnotationWorkspace.annotationUndoState.canRedo,
      canUndo: teacherAnnotationWorkspace.annotationUndoState.canUndo,
      participants: teacherAnnotationWorkspace.participants,
      ready: teacherAnnotationWorkspace.connected,
      redo: teacherAnnotationWorkspace.redoAnnotation,
      elements: teacherAnnotationWorkspace.annotationElements,
      setElements: teacherAnnotationWorkspace.setAnnotationElements,
      undo: teacherAnnotationWorkspace.undoAnnotation,
      updateCursor: teacherAnnotationWorkspace.updateCursor,
    };
  }, [
    teacherAnnotationDocumentState.document?.id,
    teacherAnnotationWorkspace.annotationElements,
    teacherAnnotationWorkspace.annotationUndoState,
    teacherAnnotationWorkspace.connected,
    teacherAnnotationWorkspace.participants,
    teacherAnnotationWorkspace.setAnnotationElements,
    teacherAnnotationWorkspace.redoAnnotation,
    teacherAnnotationWorkspace.undoAnnotation,
    teacherAnnotationWorkspace.updateCursor,
  ]);
  const teacherHtmlGameSync = useMemo(
    () => teacherAnnotationWorkspace.htmlGameSync(true),
    [teacherAnnotationWorkspace.htmlGameSync],
  );
  const teacherViewportSync = useMemo(() => ({
    clientId: teacherAnnotationWorkspace.workspaceClientId,
    publish: teacherAnnotationWorkspace.setMaterialViewport,
    ready: teacherAnnotationWorkspace.connected,
    state: teacherAnnotationWorkspace.materialViewport,
  }), [
    teacherAnnotationWorkspace.connected,
    teacherAnnotationWorkspace.materialViewport,
    teacherAnnotationWorkspace.setMaterialViewport,
    teacherAnnotationWorkspace.workspaceClientId,
  ]);
  const externalActivityBlocks = useMemo(
    () => visibleMaterial ? materialDocumentBlocks(visibleMaterial) : [],
    [visibleMaterial?.document, visibleMaterial?.id, visibleMaterial?.title],
  );
  const externalActivitiesEnabled = externalActivityFeatureEnabled();
  const teacherExternalActivitySync = useExternalActivitySession({
    blocks: externalActivityBlocks,
    enabled: canMonitorSubmissions && !isParallelWork && externalActivitiesEnabled,
    isHost: canMonitorSubmissions,
    participantColor: collaborationParticipantColor(profile?.subject ?? displayName),
    participantName: displayName,
  });

  useEffect(() => {
    setTeacherTaskVisible((current) => teacherTaskVisibilityAfterSharedGame(
      current,
      canMonitorSubmissions,
      teacherHtmlGameSync.presentedBlockId,
    ));
  }, [canMonitorSubmissions, teacherHtmlGameSync.presentedBlockId]);

  useEffect(() => {
    if (canMonitorSubmissions && teacherExternalActivitySync.active?.visible) setTeacherTaskVisible(true);
  }, [canMonitorSubmissions, teacherExternalActivitySync.active?.visible]);

  useEffect(() => {
    if (!canMonitorSubmissions || teacherWorkParticipants.length === 0) {
      setActiveStudentSubject(null);
      setTeacherTaskVisible(false);
      return;
    }

    if (!activeStudentSubject || !teacherWorkParticipants.some((participant) => participant.subject === activeStudentSubject)) {
      setActiveStudentSubject(teacherWorkParticipants[0]?.subject ?? null);
      setTeacherTaskVisible(false);
    }
  }, [activeStudentSubject, canMonitorSubmissions, teacherWorkParticipantKey]);

  useEffect(() => {
    if (!isParallelWork || !canMonitorSubmissions) {
      setStudentHealthState({});
      return;
    }

    setStudentHealthState((current) => updateStudentHealthState(current, submissionSnapshots, healthSubjects));
  }, [canMonitorSubmissions, healthSubjectKey, isParallelWork, submissionSnapshots]);

  function selectStudentWork(subject: string) {
    setActiveStudentSubject(subject);
    setTeacherTaskVisible(false);
    setStudentHealthState((current) => acknowledgeStudentHealth(current, subject));
  }

  const activeParticipantLabel = activeParticipant?.displayName ?? activeParticipant?.username ?? activeParticipant?.subject ?? "";

  return (
    <section className="playsay-workbench" data-presentation-mode={presentationMode}>
      {canMonitorSubmissions ? (
        <TeacherLessonToolbar
          activityRailAction={vocabularyFeatures.personalPracticeV2 ? (
            <Button
              aria-expanded={activityRailOpen}
              aria-label={t("classroom.activityRail.open")}
              onClick={() => setActivityRailOpen((current) => !current)}
              type="button"
              variant="outline"
            >
              <PanelRight className="h-4 w-4" />
              <span className="playsay-teacher-toolbar-action-label">{t("classroom.activityRail.open")}</span>
            </Button>
          ) : undefined}
          activeStudentSubject={activeParticipant?.subject ?? null}
          assigningMaterial={assigningMaterial}
          canManageMaterial={canManageMaterial}
          currentMaterialId={session.materialId}
          compact={vocabularyFeatures.personalPracticeV2}
          materials={selectableMaterials}
          onAssignMaterial={() => void assignMaterial()}
          onSelectMaterial={setSelectedMaterialId}
          onSelectStudent={selectStudentWork}
          onUploadHtmlGamePage={(file) => void uploadHtmlGamePage(file)}
          onUploadImagePage={(file) => void uploadImagePage(file)}
          participants={teacherWorkParticipants}
          selectedMaterialId={selectedMaterialId}
          uploadingHtmlGamePage={uploadingHtmlGamePage}
          uploadingImagePage={uploadingImagePage}
          vocabularyAction={(
            <VocabularyLessonDialog
              ownerLabel={activeParticipantLabel}
              ownerSubject={activeParticipant?.subject}
              onStartPractice={vocabularyFeatures.live ? () => void startVocabularyPractice() : undefined}
              recipientSubjects={session.participants.map((participant) => participant.subject)}
              source={{
                sourceType: "LESSON",
                lessonId: session.lessonId,
                materialId: visibleMaterial?.id,
                ownerSubject: activeParticipant?.subject,
              }}
              triggerClassName="playsay-teacher-toolbar-vocabulary"
              triggerLabelClassName="playsay-teacher-toolbar-action-label"
            />
          )}
        />
      ) : (
        <header className="playsay-workbench-topbar">
          <nav className="playsay-lesson-tabs" aria-label={t("classroom.tabs.aria")}>
            <button className="playsay-lesson-tab" data-active="true" type="button">
              {t("classroom.tabs.lesson")}
            </button>
          </nav>

          <div className="playsay-workbench-tools">
            <VocabularyLessonDialog
              ownerSubject={profile?.subject}
              source={{
                sourceType: "LESSON",
                lessonId: session.lessonId,
                materialId: visibleMaterial?.id,
              }}
              triggerClassName="playsay-vocabulary-trigger"
              triggerLabelClassName="playsay-vocabulary-trigger-label"
            />
            <div className="playsay-lesson-statusline">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-4 w-4 text-primary" />
                {formatLessonRange(session.lessonStartsAt, session.lessonEndsAt, translate)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" />
                {formatParticipantCount(session.participants.length, translate)}
              </span>
            </div>
          </div>
        </header>
      )}

      <div className="playsay-workbench-layout">
      <div className="playsay-workbench-body">

        {assignmentMessage ? (
          <div className="playsay-lesson-inline-message">
            {assignmentMessage}
          </div>
        ) : null}

        {visibleMaterial ? (
          <div className="playsay-assignment-strip" aria-label={t("classroom.material.assignedAria")}>
            {materialDocumentBlocks(visibleMaterial).slice(0, 6).map((block, index) => (
              <AssignmentStub
                active={index === 0}
                key={block.id}
                tag={materialBlockLabel(block.type)}
                title={block.title}
              />
            ))}
          </div>
        ) : (
          <div className="playsay-assignment-strip" aria-label={t("classroom.material.assignedAria")}>
            <AssignmentStub active title={t("classroom.material.unassignedTitle")} tag={t("classroom.tabs.lesson")} />
          </div>
        )}

        {vocabularyFeatures.live && liveVocabulary.practice ? (
          <VocabularyLiveStage
            activeStudentSubject={activeParticipant?.subject}
            canManage={canMonitorSubmissions}
            onClose={() => liveVocabulary.setPractice(null)}
            onPracticeChange={liveVocabulary.setPractice}
            practice={liveVocabulary.practice}
            profileSubject={profile?.subject}
            selectedStudentSubject={activeParticipant?.subject}
            teacherPlayerOnly={canMonitorSubmissions && vocabularyFeatures.personalPracticeV2}
          />
        ) : null}

        <div
          aria-hidden={liveVocabulary.practice ? "true" : undefined}
          className={liveVocabulary.practice ? "hidden" : "contents"}
        >
        {canMonitorSubmissions && visibleMaterial ? (
          <MaterialSubmissionsMonitor
            activeStudentSubject={activeParticipant?.subject ?? null}
            error={submissionMonitorError}
            health={isParallelWork ? studentHealthViews(studentHealthState) : undefined}
            onSelectStudent={isParallelWork ? selectStudentWork : undefined}
            participants={isParallelWork ? assignedParticipants : undefined}
            submissions={submissionSnapshots}
          />
        ) : null}

        {isParallelWork && externalActivityBlocks.some((block) => block.type === "externalActivity") ? (
          <div className="playsay-lesson-inline-message" role="status">{t("materials.externalActivity.parallelUnsupported")}</div>
        ) : null}

        {materialLoading ? (
          <div className="playsay-task-board playsay-material-loading">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>{t("classroom.material.loading")}</span>
          </div>
        ) : visibleMaterial ? (
          canMonitorSubmissions ? (
            teacherTaskVisible ? (
              <LessonTaskCanvas
                canControlPages={!isParallelWork}
                collaborationControls={null}
                lessonId={session.lessonId}
                material={visibleMaterial}
                annotationSync={isParallelWork ? null : teacherAnnotationSync}
                exerciseSync={isParallelWork ? undefined : teacherAnnotationWorkspace.exerciseSync}
                htmlGameSync={isParallelWork ? undefined : teacherHtmlGameSync}
                videoSync={isParallelWork ? undefined : teacherAnnotationWorkspace.videoSync}
                externalActivitySync={isParallelWork || !externalActivitiesEnabled ? undefined : teacherExternalActivitySync}
                liveActivePageId={liveActivePageId}
                onSaveAnswers={(content) => void saveMaterialAnswers(content, activeParticipant?.subject)}
                onPresentationModeChange={onPresentationModeChange}
                score={lessonScore}
                submission={activeStudentSubmission}
                submissionMessage={submissionMessage}
                submissionSaving={submissionSaving}
                teacherName={session.teacherName ?? displayName}
                viewportSync={isParallelWork ? undefined : teacherViewportSync}
              />
            ) : (
              <div className="playsay-task-board playsay-teacher-task-reveal">
                <BookOpen className="h-5 w-5 text-primary" />
                <div>
                  <strong>{t("classroom.teacherTask.hiddenTitle")}</strong>
                  <span>{t("classroom.teacherTask.credit", { name: activeParticipantLabel })}</span>
                </div>
                <Button disabled={!activeParticipant} onClick={() => setTeacherTaskVisible(true)} type="button">
                  <Eye className="h-4 w-4" />
                  {t("classroom.teacherTask.show")}
                </Button>
              </div>
            )
          ) : isParallelWork ? (
            <LessonTaskCanvas
              lessonId={session.lessonId}
              material={visibleMaterial}
              onSaveAnswers={(content) => void saveMaterialAnswers(content)}
              onPresentationModeChange={onPresentationModeChange}
              score={lessonScore}
              submission={submission}
              submissionMessage={submissionMessage}
              submissionSaving={submissionSaving}
              teacherName={session.teacherName ?? displayName}
            />
          ) : (
            <StudentLiveWorkspace
              displayName={displayName}
              lessonId={session.lessonId}
              material={visibleMaterial}
              onSaveAnswers={(content) => void saveMaterialAnswers(content)}
              onPresentationModeChange={onPresentationModeChange}
              profileSubject={profile?.subject}
              score={lessonScore}
              sharedPresenceEnabled={studentSharedPresenceEnabled}
              submission={submission}
              submissionMessage={submissionMessage}
              submissionSaving={submissionSaving}
              teacherName={session.teacherName ?? displayName}
              teacherSubject={session.teacherSubject}
            />
          )
        ) : canManageMaterial ? (
          <div className="playsay-task-board playsay-material-loading">
            <BookOpen className="h-5 w-5 text-primary" />
            <span>{t("classroom.material.selectForLesson")}</span>
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
              onPresentationModeChange={onPresentationModeChange}
              score={lessonScore}
              submission={submission}
              submissionMessage={submissionMessage}
              submissionSaving={submissionSaving}
              teacherName={session.teacherName ?? displayName}
            />
          </>
        )}
        </div>
      </div>
      {canMonitorSubmissions && vocabularyFeatures.personalPracticeV2 ? (
        <LessonActivityRail
          assigningMaterial={assigningMaterial}
          currentMaterialId={session.materialId}
          lessonId={session.lessonId}
          materials={selectableMaterials}
          onAssignMaterial={() => void assignMaterial()}
          onClose={() => setActivityRailOpen(false)}
          onPracticeChange={(practice) => {
            liveVocabulary.setPractice(practice);
            if (practice) setActivityRailOpen(true);
          }}
          onSelectMaterial={setSelectedMaterialId}
          onSelectStudent={selectStudentWork}
          onUploadHtmlGamePage={(file) => void uploadHtmlGamePage(file)}
          onUploadImagePage={(file) => void uploadImagePage(file)}
          open={activityRailOpen}
          owners={session.participants.map((participant) => ({
            name: participant.displayName ?? participant.username ?? participant.subject,
            presence: session.participantPresence[participant.subject] === "ONLINE" ? "PRESENT" : "ABSENT",
            subject: participant.subject,
            username: participant.username,
          }))}
          practice={liveVocabulary.practice}
          selectedMaterialId={selectedMaterialId}
          selectedStudentSubject={activeParticipant?.subject ?? null}
          uploadingHtmlGamePage={uploadingHtmlGamePage}
          uploadingImagePage={uploadingImagePage}
        />
      ) : null}
      </div>
    </section>
  );
}

function externalActivityFeatureEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_EXTERNAL_ACTIVITY_ENABLED === "true";
}

export function teacherTaskVisibilityAfterLiveUpload(
  current: boolean,
  canMonitorSubmissions: boolean,
  liveActivePageId: string | null,
): boolean {
  return current || (canMonitorSubmissions && Boolean(liveActivePageId));
}

export function teacherTaskVisibilityAfterSharedGame(
  current: boolean,
  canMonitorSubmissions: boolean,
  presentedBlockId: string | null,
): boolean {
  return current || (canMonitorSubmissions && Boolean(presentedBlockId));
}

export function shouldEnableSharedMaterialPresence({
  canMonitorSubmissions,
  isParallelWork,
  workMode,
}: {
  canMonitorSubmissions: boolean;
  isParallelWork: boolean;
  workMode: ScheduledLesson["workMode"];
}): boolean {
  return !canMonitorSubmissions && !isParallelWork && workMode === "SHARED";
}
