import { useMemo } from "react";
import {
  type LessonMaterial,
  type LessonMaterialJson,
  type LessonMaterialSubmission,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { useCollaborationDocument } from "../hooks/useCollaborationDocument";
import { useYjsWorkspace } from "../hooks/useYjsWorkspace";
import { collaborationParticipantColor } from "../model/collaboration";
import { LessonTaskCanvas, type LessonPresentationMode } from "./LessonTaskCanvas";

export function StudentLiveWorkspace({
  displayName,
  lessonId,
  material,
  onSaveAnswers,
  onPresentationModeChange,
  profileSubject,
  score,
  sharedPresenceEnabled = false,
  submission,
  submissionMessage,
  submissionSaving,
  teacherName,
}: {
  displayName: string;
  lessonId: string;
  material: LessonMaterial;
  onSaveAnswers: (content: LessonMaterialJson) => void;
  onPresentationModeChange?: (mode: LessonPresentationMode) => void;
  profileSubject?: string | null;
  score: number | null;
  sharedPresenceEnabled?: boolean;
  submission: LessonMaterialSubmission | null;
  submissionMessage: string | null;
  submissionSaving: boolean;
  teacherName: string;
}) {
  const { t } = useAppTranslation();
  const participantColor = collaborationParticipantColor(profileSubject ?? displayName);
  const groupAnnotationDocumentState = useCollaborationDocument({
    enabled: true,
    lessonId,
    materialId: material.id,
    mode: "group",
  });
  const groupAnnotationWorkspace = useYjsWorkspace({
    color: participantColor,
    document: groupAnnotationDocumentState.document,
    enabled: Boolean(groupAnnotationDocumentState.document),
    participantName: displayName,
  });
  const annotationSync = useMemo(() => {
    if (!sharedPresenceEnabled || !groupAnnotationDocumentState.document) {
      return null;
    }
    return {
      participants: groupAnnotationWorkspace.participants,
      ready: groupAnnotationWorkspace.connected,
      setStrokes: groupAnnotationWorkspace.setAnnotationStrokes,
      strokes: groupAnnotationWorkspace.annotationStrokes,
      updateCursor: groupAnnotationWorkspace.updateCursor,
    };
  }, [
    groupAnnotationDocumentState.document?.id,
    groupAnnotationWorkspace.annotationStrokes,
    groupAnnotationWorkspace.connected,
    groupAnnotationWorkspace.participants,
    groupAnnotationWorkspace.setAnnotationStrokes,
    groupAnnotationWorkspace.updateCursor,
    sharedPresenceEnabled,
  ]);
  const htmlGameSync = useMemo(
    () => groupAnnotationWorkspace.htmlGameSync(false),
    [groupAnnotationWorkspace.htmlGameSync],
  );

  return (
    <section className="playsay-live-workspace" aria-label={t("classroom.collaboration.workspaceAria")}>
      {groupAnnotationDocumentState.error ? (
        <div className="playsay-lesson-inline-message">{groupAnnotationDocumentState.error}</div>
      ) : null}

      <LessonTaskCanvas
        lessonId={lessonId}
        material={material}
        annotationSync={annotationSync}
        htmlGameSync={htmlGameSync}
        onSaveAnswers={onSaveAnswers}
        onPresentationModeChange={onPresentationModeChange}
        score={score}
        submission={submission}
        submissionMessage={submissionMessage}
        submissionSaving={submissionSaving}
        teacherName={teacherName}
      />
    </section>
  );
}
