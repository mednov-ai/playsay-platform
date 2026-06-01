import { CheckCircle2, FileCheck2, Loader2, Save, User, Users } from "lucide-react";
import { useMemo, useState, type PointerEvent } from "react";
import { Button } from "../../../components/ui/button";
import {
  type LessonMaterial,
  type LessonMaterialJson,
  type LessonMaterialSubmission,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { useCollaborationDocument } from "../hooks/useCollaborationDocument";
import { useYjsWorkspace } from "../hooks/useYjsWorkspace";
import {
  canFinalizeCollaborationMode,
  collaborationParticipantColor,
  type CollaborationWorkspaceMode,
} from "../model/collaboration";
import { LessonTaskCanvas } from "./LessonTaskCanvas";
import { PresenceCursorLayer } from "./PresenceCursorLayer";

export function StudentLiveWorkspace({
  displayName,
  lessonId,
  material,
  onFinalized,
  onSaveAnswers,
  profileSubject,
  score,
  submission,
  submissionMessage,
  submissionSaving,
  teacherName,
}: {
  displayName: string;
  lessonId: string;
  material: LessonMaterial;
  onFinalized: (submission: LessonMaterialSubmission) => void;
  onSaveAnswers: (content: LessonMaterialJson) => void;
  profileSubject?: string | null;
  score: number | null;
  submission: LessonMaterialSubmission | null;
  submissionMessage: string | null;
  submissionSaving: boolean;
  teacherName: string;
}) {
  const { t } = useAppTranslation();
  const [mode, setMode] = useState<CollaborationWorkspaceMode>("individual");
  const participantColor = collaborationParticipantColor(profileSubject ?? displayName);
  const documentState = useCollaborationDocument({
    lessonId,
    materialId: material.id,
    mode,
  });
  const workspace = useYjsWorkspace({
    color: participantColor,
    document: documentState.document,
    participantName: displayName,
  });
  const groupAnnotationDocumentState = useCollaborationDocument({
    enabled: mode !== "group",
    lessonId,
    materialId: material.id,
    mode: "group",
  });
  const groupAnnotationWorkspace = useYjsWorkspace({
    color: participantColor,
    document: groupAnnotationDocumentState.document,
    enabled: mode !== "group" && Boolean(groupAnnotationDocumentState.document),
    participantName: displayName,
  });
  const annotationDocument = mode === "group" ? documentState.document : groupAnnotationDocumentState.document;
  const annotationWorkspace = mode === "group" ? workspace : groupAnnotationWorkspace;
  const annotationSync = useMemo(() => {
    if (!annotationDocument) {
      return null;
    }
    return {
      participants: annotationWorkspace.participants,
      ready: annotationWorkspace.connected,
      setStrokes: annotationWorkspace.setAnnotationStrokes,
      strokes: annotationWorkspace.annotationStrokes,
      updateCursor: annotationWorkspace.updateCursor,
    };
  }, [
    annotationDocument?.id,
    annotationWorkspace.annotationStrokes,
    annotationWorkspace.connected,
    annotationWorkspace.participants,
    annotationWorkspace.setAnnotationStrokes,
    annotationWorkspace.updateCursor,
  ]);

  async function finalizeWork() {
    if (!canFinalizeCollaborationMode(mode)) {
      return;
    }
    const saved = await documentState.finalize(workspace.snapshot());
    if (saved) {
      onFinalized(saved);
    }
  }

  function updateCursor(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    workspace.updateCursor({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  }

  const liveStatus = liveStatusLabel(workspace.status, t);
  const canFinalize = canFinalizeCollaborationMode(mode);
  const statusIcon = workspace.connected ? (
    <CheckCircle2 className="h-3.5 w-3.5" />
  ) : documentState.loading ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
  ) : (
    <Save className="h-3.5 w-3.5" />
  );

  return (
    <section className="playsay-live-workspace" aria-label={t("classroom.collaboration.workspaceAria")}>
      <header className="playsay-live-workspace-header">
        <div className="playsay-live-mode-switch" role="tablist" aria-label={t("classroom.collaboration.modeAria")}>
          <button
            aria-selected={mode === "individual"}
            data-active={mode === "individual" ? "true" : "false"}
            data-testid="collaboration-mode-individual"
            onClick={() => setMode("individual")}
            role="tab"
            type="button"
          >
            <User className="h-4 w-4" />
            {t("classroom.collaboration.individual")}
          </button>
          <button
            aria-selected={mode === "group"}
            data-active={mode === "group" ? "true" : "false"}
            data-testid="collaboration-mode-group"
            onClick={() => setMode("group")}
            role="tab"
            type="button"
          >
            <Users className="h-4 w-4" />
            {t("classroom.collaboration.group")}
          </button>
        </div>
        <span className="playsay-live-sync-status" data-state={workspace.status}>
          {statusIcon}
          {liveStatus}
        </span>
      </header>

      {documentState.error ? (
        <div className="playsay-lesson-inline-message">{documentState.error}</div>
      ) : null}

      <div className="playsay-live-workspace-grid">
        <LessonTaskCanvas
          collaborationControls={(
            <>
              <Button
                data-testid="collaboration-finalize-button"
                disabled={documentState.finalizing || !documentState.document || !canFinalize}
                onClick={() => void finalizeWork()}
                type="button"
              >
                {documentState.finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                {documentState.finalizing ? t("classroom.collaboration.finalizing") : t("classroom.collaboration.finalize")}
              </Button>
              <span className="playsay-task-submit-status">
                {documentState.message ??
                  (canFinalize
                    ? submissionMessage ?? t("classroom.collaboration.autosave")
                    : t("classroom.collaboration.groupFinalizeUnavailable"))}
              </span>
            </>
          )}
          lessonId={lessonId}
          material={material}
          annotationSync={annotationSync}
          onSaveAnswers={onSaveAnswers}
          score={score}
          submission={submission}
          submissionMessage={submissionMessage}
          submissionSaving={submissionSaving}
          teacherName={teacherName}
        />

        <aside
          className="playsay-live-editor"
          onPointerLeave={() => workspace.updateCursor(null)}
          onPointerMove={updateCursor}
        >
          <PresenceCursorLayer participants={workspace.participants} />
          <div className="playsay-live-editor-header">
            <strong>{mode === "group" ? t("classroom.collaboration.groupDocument") : t("classroom.collaboration.myDocument")}</strong>
            <span>{documentState.document ? t("classroom.collaboration.version", { version: documentState.document.version }) : t("classroom.collaboration.preparing")}</span>
          </div>
          <textarea
            className="playsay-live-textarea"
            data-testid="collaboration-live-textarea"
            disabled={!documentState.document}
            onChange={(event) => workspace.updateText(event.target.value)}
            placeholder={t("classroom.collaboration.editorPlaceholder")}
            value={workspace.text}
          />
          <div className="playsay-live-presence-strip">
            {workspace.participants.length === 0 ? (
              <span>{t("classroom.collaboration.noPresence")}</span>
            ) : (
              workspace.participants.slice(0, 6).map((participant) => (
                <span className="playsay-live-presence-pill" key={participant.clientId}>
                  <span style={{ backgroundColor: participant.color }} />
                  {participant.name}
                </span>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function liveStatusLabel(status: string, t: (key: string) => string): string {
  if (status === "connected") {
    return t("classroom.collaboration.connected");
  }
  if (status === "connecting") {
    return t("classroom.collaboration.connecting");
  }
  if (status === "error") {
    return t("classroom.collaboration.connectionError");
  }
  if (status === "disconnected") {
    return t("classroom.collaboration.disconnected");
  }
  return t("classroom.collaboration.preparing");
}
