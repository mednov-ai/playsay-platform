import { useMemo } from "react";
import {
  type LessonMaterial,
  type LessonMaterialJson,
  type LessonMaterialSubmission,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { useCollaborationDocument } from "../hooks/useCollaborationDocument";
import { useYjsWorkspace } from "../hooks/useYjsWorkspace";
import { useExternalActivitySession } from "../hooks/useExternalActivitySession";
import { materialDocumentBlocks } from "../../materials";
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
    if (!groupAnnotationDocumentState.document) {
      return null;
    }
    return {
      canRedo: groupAnnotationWorkspace.annotationUndoState.canRedo,
      canUndo: groupAnnotationWorkspace.annotationUndoState.canUndo,
      participants: sharedPresenceEnabled ? groupAnnotationWorkspace.participants : [],
      ready: groupAnnotationWorkspace.connected,
      redo: groupAnnotationWorkspace.redoAnnotation,
      elements: groupAnnotationWorkspace.annotationElements,
      setElements: groupAnnotationWorkspace.setAnnotationElements,
      undo: groupAnnotationWorkspace.undoAnnotation,
      updateCursor: sharedPresenceEnabled ? groupAnnotationWorkspace.updateCursor : () => undefined,
    };
  }, [
    groupAnnotationDocumentState.document?.id,
    groupAnnotationWorkspace.annotationElements,
    groupAnnotationWorkspace.annotationUndoState,
    groupAnnotationWorkspace.connected,
    groupAnnotationWorkspace.participants,
    groupAnnotationWorkspace.setAnnotationElements,
    groupAnnotationWorkspace.redoAnnotation,
    groupAnnotationWorkspace.undoAnnotation,
    groupAnnotationWorkspace.updateCursor,
    sharedPresenceEnabled,
  ]);
  const htmlGameSync = useMemo(
    () => groupAnnotationWorkspace.htmlGameSync(false),
    [groupAnnotationWorkspace.htmlGameSync],
  );
  const viewportSync = useMemo(() => ({
    clientId: groupAnnotationWorkspace.workspaceClientId,
    publish: groupAnnotationWorkspace.setMaterialViewport,
    ready: groupAnnotationWorkspace.connected,
    state: groupAnnotationWorkspace.materialViewport,
  }), [
    groupAnnotationWorkspace.connected,
    groupAnnotationWorkspace.materialViewport,
    groupAnnotationWorkspace.setMaterialViewport,
    groupAnnotationWorkspace.workspaceClientId,
  ]);
  const externalActivityBlocks = useMemo(
    () => materialDocumentBlocks(material),
    [material.document, material.id, material.title],
  );
  const externalActivitiesEnabled = import.meta.env.DEV || import.meta.env.VITE_EXTERNAL_ACTIVITY_ENABLED === "true";
  const externalActivitySync = useExternalActivitySession({
    blocks: externalActivityBlocks,
    enabled: externalActivitiesEnabled,
    isHost: false,
    participantColor,
    participantName: displayName,
  });

  return (
    <section className="playsay-live-workspace" aria-label={t("classroom.collaboration.workspaceAria")}>
      {groupAnnotationDocumentState.error ? (
        <div className="playsay-lesson-inline-message">{groupAnnotationDocumentState.error}</div>
      ) : null}

      <LessonTaskCanvas
        lessonId={lessonId}
        material={material}
        annotationSync={annotationSync}
        exerciseSync={groupAnnotationWorkspace.exerciseSync}
        htmlGameSync={htmlGameSync}
        externalActivitySync={externalActivitiesEnabled ? externalActivitySync : undefined}
        onSaveAnswers={onSaveAnswers}
        onPresentationModeChange={onPresentationModeChange}
        score={score}
        submission={submission}
        submissionMessage={submissionMessage}
        submissionSaving={submissionSaving}
        teacherName={teacherName}
        viewportSync={viewportSync}
      />
    </section>
  );
}
