import { BookOpen, Clock3, Eye, FileCode2, ImagePlus, Loader2, Plus, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Button } from "../../../components/ui/button";
import { canAssignLessons } from "../../../entities/workspace/model";
import { formatLessonRange, formatParticipantCount } from "../../../entities/schedule/model";
import {
  type LessonMaterial,
  type MeProfile,
  type ScheduledLesson,
} from "../../../shared/api/playsay";
import { useCollaborationDocument } from "../hooks/useCollaborationDocument";
import { useLessonMaterial } from "../hooks/useLessonMaterial";
import { useLessonSubmission } from "../hooks/useLessonSubmission";
import { useYjsWorkspace } from "../hooks/useYjsWorkspace";
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
import { useAppTranslation } from "../../../shared/i18n";
import { VocabularyQuickAdd } from "../../vocabulary/ui/VocabularyQuickAdd";

export function LessonWorkspace({
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
  const assignedParticipants = session.participants.filter((participant) => Boolean(participant.materialId));
  const isParallelWork = session.workMode === "PARALLEL" &&
    session.participants.length > 1 &&
    assignedParticipants.length === session.participants.length;
  const teacherWorkParticipants = isParallelWork ? assignedParticipants : session.participants;
  const teacherWorkParticipantKey = teacherWorkParticipants.map((participant) => participant.subject).join("|");
  const studentSharedPresenceEnabled = !canMonitorSubmissions &&
    !isParallelWork &&
    session.lessonType === "GROUP" &&
    session.workMode === "SHARED" &&
    session.participants.length > 1;
  const canManageMaterial = canAssignLessons(profile) && !isParallelWork;
  const [activeStudentSubject, setActiveStudentSubject] = useState<string | null>(null);
  const [teacherTaskVisible, setTeacherTaskVisible] = useState(false);
  const [presentationMode, setPresentationMode] = useState<LessonPresentationMode>("default");

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
    participantName: displayName,
  });
  const teacherAnnotationSync = useMemo(() => {
    if (!teacherAnnotationDocumentState.document) {
      return null;
    }
    return {
      participants: teacherAnnotationWorkspace.participants,
      ready: teacherAnnotationWorkspace.connected,
      elements: teacherAnnotationWorkspace.annotationElements,
      setElements: teacherAnnotationWorkspace.setAnnotationElements,
      updateCursor: teacherAnnotationWorkspace.updateCursor,
    };
  }, [
    teacherAnnotationDocumentState.document?.id,
    teacherAnnotationWorkspace.annotationElements,
    teacherAnnotationWorkspace.connected,
    teacherAnnotationWorkspace.participants,
    teacherAnnotationWorkspace.setAnnotationElements,
    teacherAnnotationWorkspace.updateCursor,
  ]);
  const teacherHtmlGameSync = useMemo(
    () => teacherAnnotationWorkspace.htmlGameSync(true),
    [teacherAnnotationWorkspace.htmlGameSync],
  );

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

  function handleImagePageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) {
      void uploadImagePage(file);
    }
  }

  function handleHtmlGamePageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) {
      void uploadHtmlGamePage(file);
    }
  }

  const activeParticipantLabel = activeParticipant?.displayName ?? activeParticipant?.username ?? activeParticipant?.subject ?? "";

  return (
    <section className="playsay-workbench" data-presentation-mode={presentationMode}>
      <header className="playsay-workbench-topbar">
        <nav className="playsay-lesson-tabs" aria-label={t("classroom.tabs.aria")}>
          <button className="playsay-lesson-tab" data-active="true" type="button">
            {t("classroom.tabs.lesson")}
          </button>
        </nav>

        <div className="playsay-workbench-tools">
          <VocabularyQuickAdd recipientSubjects={canMonitorSubmissions ? session.participants.map((participant) => participant.subject) : []} source={{ sourceType: "LESSON", lessonId: session.lessonId, materialId: visibleMaterial?.id, ownerSubject: canMonitorSubmissions ? activeParticipant?.subject : undefined }}><span /></VocabularyQuickAdd>
          {canMonitorSubmissions && teacherWorkParticipants.length > 0 ? (
            <label className="playsay-teacher-target-picker">
              <span>{t("classroom.teacherTask.targetLabel")}</span>
              <select
                className="playsay-input"
                onChange={(event) => selectStudentWork(event.target.value)}
                value={activeParticipant?.subject ?? ""}
              >
                {teacherWorkParticipants.map((participant) => (
                  <option key={participant.subject} value={participant.subject}>
                    {participant.displayName ?? participant.username ?? participant.subject}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {canManageMaterial ? (
            <div className="playsay-lesson-material-picker">
              <select
                className="playsay-input"
                disabled={assigningMaterial || selectableMaterials.length === 0}
                onChange={(event) => setSelectedMaterialId(event.target.value)}
                value={selectedMaterialId}
              >
                <option value="">{t("classroom.material.pickerEmpty")}</option>
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
                {t("classroom.actions.assign")}
              </Button>
              <Button asChild variant="outline">
                <label aria-disabled={uploadingImagePage ? "true" : "false"} className="playsay-live-image-upload">
                  <input
                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    className="sr-only"
                    disabled={uploadingImagePage}
                    onChange={handleImagePageSelect}
                    type="file"
                  />
                  {uploadingImagePage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {uploadingImagePage ? t("classroom.actions.uploadingImagePage") : t("classroom.actions.addImagePage")}
                </label>
              </Button>
              <Button asChild variant="outline">
                <label aria-disabled={uploadingHtmlGamePage ? "true" : "false"} className="playsay-live-image-upload">
                  <input
                    accept="text/html,.html"
                    className="sr-only"
                    disabled={uploadingHtmlGamePage}
                    onChange={handleHtmlGamePageSelect}
                    type="file"
                  />
                  {uploadingHtmlGamePage ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />}
                  {uploadingHtmlGamePage ? t("classroom.actions.uploadingHtmlGamePage") : t("classroom.actions.addHtmlGamePage")}
                </label>
              </Button>
            </div>
          ) : null}
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
                htmlGameSync={isParallelWork ? undefined : teacherHtmlGameSync}
                liveActivePageId={liveActivePageId}
                onSaveAnswers={(content) => void saveMaterialAnswers(content, activeParticipant?.subject)}
                onPresentationModeChange={setPresentationMode}
                score={lessonScore}
                submission={activeStudentSubmission}
                submissionMessage={submissionMessage}
                submissionSaving={submissionSaving}
                teacherName={session.teacherName ?? displayName}
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
              onPresentationModeChange={setPresentationMode}
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
              onPresentationModeChange={setPresentationMode}
              profileSubject={profile?.subject}
              score={lessonScore}
              sharedPresenceEnabled={studentSharedPresenceEnabled}
              submission={submission}
              submissionMessage={submissionMessage}
              submissionSaving={submissionSaving}
              teacherName={session.teacherName ?? displayName}
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
              onPresentationModeChange={setPresentationMode}
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

export function teacherTaskVisibilityAfterLiveUpload(
  current: boolean,
  canMonitorSubmissions: boolean,
  liveActivePageId: string | null,
): boolean {
  return current || (canMonitorSubmissions && Boolean(liveActivePageId));
}
