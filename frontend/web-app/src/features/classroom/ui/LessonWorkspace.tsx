import { BookOpen, Clock3, Loader2, Plus, Users } from "lucide-react";
import { useMemo } from "react";
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
  AssignmentStub,
  averageSubmissionScore,
  materialBlockLabel,
  materialDocumentBlocks,
} from "../../materials";
import { LessonTaskCanvas } from "./LessonTaskCanvas";
import { MaterialSubmissionsMonitor } from "./MaterialSubmissionsMonitor";
import { StudentLiveWorkspace } from "./StudentLiveWorkspace";
import { useAppTranslation } from "../../../shared/i18n";

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
    selectedMaterialId,
    setSelectedMaterialId,
  } = useLessonMaterial({ onAssignMaterial, session });
  const canMonitorSubmissions = canAssignLessons(profile);
  const canManageMaterial = canAssignLessons(profile);
  const {
    registerSubmission,
    saveMaterialAnswers,
    submission,
    submissionMessage,
    submissionMonitorError,
    submissionSaving,
    submissionSnapshots,
  } = useLessonSubmission({ canMonitorSubmissions, material, session });
  const selectableMaterials = materials.filter((item) => item.status !== "ARCHIVED");
  const lessonScore = canMonitorSubmissions ? averageSubmissionScore(submissionSnapshots) : submission?.score ?? null;
  const teacherAnnotationDocumentState = useCollaborationDocument({
    enabled: canMonitorSubmissions && Boolean(material),
    lessonId: session.lessonId,
    materialId: material?.id,
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
      setStrokes: teacherAnnotationWorkspace.setAnnotationStrokes,
      strokes: teacherAnnotationWorkspace.annotationStrokes,
      updateCursor: teacherAnnotationWorkspace.updateCursor,
    };
  }, [
    teacherAnnotationDocumentState.document?.id,
    teacherAnnotationWorkspace.annotationStrokes,
    teacherAnnotationWorkspace.connected,
    teacherAnnotationWorkspace.participants,
    teacherAnnotationWorkspace.setAnnotationStrokes,
    teacherAnnotationWorkspace.updateCursor,
  ]);

  return (
    <section className="playsay-workbench">
      <header className="playsay-workbench-topbar">
        <nav className="playsay-lesson-tabs" aria-label={t("classroom.tabs.aria")}>
          <button className="playsay-lesson-tab" data-active="true" type="button">
            {t("classroom.tabs.lesson")}
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

        {material ? (
          <div className="playsay-assignment-strip" aria-label={t("classroom.material.assignedAria")}>
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
          <div className="playsay-assignment-strip" aria-label={t("classroom.material.assignedAria")}>
            <AssignmentStub active title={t("classroom.material.unassignedTitle")} tag={t("classroom.tabs.lesson")} />
          </div>
        )}

        {canMonitorSubmissions && material ? (
          <MaterialSubmissionsMonitor error={submissionMonitorError} submissions={submissionSnapshots} />
        ) : null}

        {materialLoading ? (
          <div className="playsay-task-board playsay-material-loading">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>{t("classroom.material.loading")}</span>
          </div>
        ) : material ? (
          canMonitorSubmissions ? (
            <LessonTaskCanvas
              collaborationControls={null}
              lessonId={session.lessonId}
              material={material}
              annotationSync={teacherAnnotationSync}
              onSaveAnswers={(content) => void saveMaterialAnswers(content)}
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
              material={material}
              onFinalized={registerSubmission}
              onSaveAnswers={(content) => void saveMaterialAnswers(content)}
              profileSubject={profile?.subject}
              score={lessonScore}
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
