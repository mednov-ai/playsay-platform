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
import { externalActivityFeatureEnabled } from "../model/externalActivityAvailability";
import { LessonTaskCanvas, type LessonPresentationMode } from "./LessonTaskCanvas";

export function StudentLiveWorkspace({
  displayName,
  lessonId,
  material,
  onSaveAnswers,
  onPresentationModeChange,
  profileSubject,
  parallelWork = false,
  studentSubject,
  score,
  sharedPresenceEnabled = false,
  submission,
  submissionMessage,
  submissionSaving,
  teacherName,
  teacherSubject,
}: {
  displayName: string;
  lessonId: string;
  material: LessonMaterial;
  onSaveAnswers: (content: LessonMaterialJson) => void;
  onPresentationModeChange?: (mode: LessonPresentationMode) => void;
  profileSubject?: string | null;
  parallelWork?: boolean;
  studentSubject?: string | null;
  score: number | null;
  sharedPresenceEnabled?: boolean;
  submission: LessonMaterialSubmission | null;
  submissionMessage: string | null;
  submissionSaving: boolean;
  teacherName: string;
  teacherSubject: string | null;
}) {
  const { t } = useAppTranslation();
  const participantColor = collaborationParticipantColor(profileSubject ?? displayName);
  const groupAnnotationDocumentState = useCollaborationDocument({
    enabled: !parallelWork || Boolean(profileSubject),
    lessonId,
    materialId: material.id,
    mode: parallelWork ? "individual" : "group",
    studentSubject,
  });
  const groupAnnotationWorkspace = useYjsWorkspace({
    color: participantColor,
    document: groupAnnotationDocumentState.document,
    enabled: Boolean(groupAnnotationDocumentState.document),
    onDocumentInvalid: groupAnnotationDocumentState.invalidateDocument,
    participantName: displayName,
    preserveDraftKey: parallelWork && profileSubject && groupAnnotationDocumentState.document
      ? JSON.stringify([profileSubject, groupAnnotationDocumentState.document.id]) : undefined,
  });
  const annotationSync = useMemo(() => {
    if (!groupAnnotationDocumentState.document) {
      return null;
    }
    return {
      canRedo: groupAnnotationWorkspace.annotationUndoState.canRedo,
      canUndo: groupAnnotationWorkspace.annotationUndoState.canUndo,
      participants: sharedPresenceEnabled || parallelWork ? groupAnnotationWorkspace.participants : [],
      ready: groupAnnotationWorkspace.connected,
      reconnectCount: groupAnnotationWorkspace.reconnectCount,
      retry: groupAnnotationWorkspace.retryConnection,
      redo: groupAnnotationWorkspace.redoAnnotation,
      elements: groupAnnotationWorkspace.annotationElements,
      setElements: groupAnnotationWorkspace.setAnnotationElements,
      status: groupAnnotationWorkspace.status,
      undo: groupAnnotationWorkspace.undoAnnotation,
      updateCursor: sharedPresenceEnabled || parallelWork ? groupAnnotationWorkspace.updateCursor : () => undefined,
    };
  }, [
    groupAnnotationDocumentState.document?.id,
    groupAnnotationWorkspace.annotationElements,
    groupAnnotationWorkspace.annotationUndoState,
    groupAnnotationWorkspace.connected,
    groupAnnotationWorkspace.participants,
    groupAnnotationWorkspace.reconnectCount,
    groupAnnotationWorkspace.retryConnection,
    groupAnnotationWorkspace.setAnnotationElements,
    groupAnnotationWorkspace.status,
    groupAnnotationWorkspace.redoAnnotation,
    groupAnnotationWorkspace.undoAnnotation,
    groupAnnotationWorkspace.updateCursor,
    sharedPresenceEnabled,
    parallelWork,
  ]);
  const htmlGameSync = useMemo(
    () => groupAnnotationWorkspace.htmlGameSync(false),
    [groupAnnotationWorkspace.htmlGameSync],
  );
  const viewportSync = useMemo(() => ({
    canPublish: false,
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
  const externalActivitiesEnabled = externalActivityFeatureEnabled();
  const externalActivitySync = useExternalActivitySession({
    blocks: externalActivityBlocks,
    enabled: externalActivitiesEnabled && !parallelWork,
    isHost: false,
    participantColor,
    participantName: displayName,
    realtime: groupAnnotationWorkspace.externalActivityRealtime,
    trustedHostIdentity: teacherSubject,
  });

  return (
    <section className="playsay-live-workspace" aria-label={t("classroom.collaboration.workspaceAria")}>
      {parallelWork && groupAnnotationWorkspace.hasUnconfirmedDraft ? (
        <div className="playsay-lesson-inline-message" role="status">{t("classroom.collaborationRecovery.waitingForSave")}</div>
      ) : null}
      {groupAnnotationDocumentState.error ? (
        <div className="playsay-lesson-inline-message" role="alert">
          {groupAnnotationDocumentState.error}
          {parallelWork ? <button type="button" className="playsay-ghost-button" onClick={() => void groupAnnotationDocumentState.refresh()}>{t("classroom.collaborationRecovery.retry")}</button> : null}
        </div>
      ) : null}

      {parallelWork && !groupAnnotationDocumentState.document ? (
        !groupAnnotationDocumentState.error ? <div role="status">{t("classroom.material.loading")}</div> : null
      ) : <LessonTaskCanvas
        collaborationControls={studentSubject ? null : undefined}
        lessonId={lessonId}
        material={material}
        annotationSync={annotationSync}
        exerciseSync={parallelWork ? undefined : groupAnnotationWorkspace.exerciseSync}
        htmlGameSync={parallelWork ? undefined : htmlGameSync}
        videoSync={parallelWork ? undefined : groupAnnotationWorkspace.videoSync}
        externalActivitySync={parallelWork ? undefined : externalActivitySync}
        onSaveAnswers={onSaveAnswers}
        onPresentationModeChange={onPresentationModeChange}
        score={score}
        submission={submission}
        submissionMessage={submissionMessage}
        submissionSaving={submissionSaving}
        teacherName={teacherName}
        viewportSync={parallelWork ? undefined : viewportSync}
      />}
    </section>
  );
}
