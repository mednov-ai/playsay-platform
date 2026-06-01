import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Users } from "lucide-react";
import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { Button } from "../../../components/ui/button";
import {
  createCurrentCollaborationDocument,
  fetchCollaborationDocuments,
  type CollaborationDocument,
  type ScheduledLesson,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import {
  collaborationDocumentDisplayName,
  collaborationDocumentStatus,
  collaborationParticipantColor,
  formatCollaborationUpdatedAt,
  isGroupCollaborationDocument,
} from "../model/collaboration";
import { useYjsWorkspace } from "../hooks/useYjsWorkspace";
import { PresenceCursorLayer } from "./PresenceCursorLayer";

export function TeacherCollaborationPanel({
  displayName,
  lessonId,
  materialId,
  participants,
  profileSubject,
}: {
  displayName: string;
  lessonId: string;
  materialId: string;
  participants: ScheduledLesson["participants"];
  profileSubject?: string | null;
}) {
  const { i18n, t } = useAppTranslation();
  const [documents, setDocuments] = useState<CollaborationDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const groupDocument = documents.find(isGroupCollaborationDocument);
  const individualDocuments = documents.filter((document) => !isGroupCollaborationDocument(document));
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) ?? groupDocument ?? individualDocuments[0] ?? null,
    [documents, groupDocument, individualDocuments, selectedDocumentId],
  );
  const selectedWorkspace = useYjsWorkspace({
    color: collaborationParticipantColor(profileSubject ?? displayName),
    document: selectedDocument,
    enabled: Boolean(selectedDocument),
    participantName: displayName,
  });
  const latestDocuments = useMemo(
    () => [...documents].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [documents],
  );

  async function loadDocuments() {
    setLoading(true);
    setError(null);
    try {
      setDocuments(await fetchCollaborationDocuments(lessonId, materialId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("classroom.collaboration.teacherLoadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function ensureGroupDocument() {
    setLoading(true);
    setError(null);
    try {
      await createCurrentCollaborationDocument(lessonId, {
        documentKind: "MATERIAL_WORK",
        materialId,
        scope: "GROUP",
      });
      await loadDocuments();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("classroom.collaboration.groupCreateFailed"));
    } finally {
      setLoading(false);
    }
  }

  function updateCursor(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    selectedWorkspace.updateCursor({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (cancelled) {
        return;
      }
      await loadDocuments();
    }

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [lessonId, materialId]);

  return (
    <section className="playsay-collaboration-panel" aria-label={t("classroom.collaboration.teacherPanelAria")}>
      <div className="playsay-collaboration-panel-summary">
        <span>
          <Users className="h-4 w-4" />
          {t("classroom.collaboration.teacherPanel")}
        </span>
        <strong>{t("classroom.collaboration.documentCount", { count: documents.length })}</strong>
        <Button className="playsay-small-action" disabled={loading} onClick={() => void loadDocuments()} type="button" variant="outline">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t("classroom.collaboration.refresh")}
        </Button>
      </div>

      {error ? (
        <div className="playsay-collaboration-panel-error">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      ) : null}

      <div className="playsay-collaboration-panel-grid">
        <div className="playsay-collaboration-group-row">
          <div>
            <strong>{t("classroom.collaboration.groupDocument")}</strong>
            <span>{groupDocument ? t("classroom.collaboration.groupReady") : t("classroom.collaboration.groupMissing")}</span>
          </div>
          {groupDocument ? (
            <button
              className="playsay-collaboration-doc-status"
              data-active={selectedDocument?.id === groupDocument.id ? "true" : "false"}
              data-state={collaborationDocumentStatus(groupDocument)}
              onClick={() => setSelectedDocumentId(groupDocument.id)}
              type="button"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {formatCollaborationUpdatedAt(groupDocument.updatedAt, i18n.resolvedLanguage ?? i18n.language)}
            </button>
          ) : (
            <Button className="playsay-small-action" disabled={loading} onClick={() => void ensureGroupDocument()} type="button">
              {t("classroom.collaboration.createGroup")}
            </Button>
          )}
        </div>

        {selectedDocument ? (
          <div
            className="playsay-teacher-live-editor"
            onPointerLeave={() => selectedWorkspace.updateCursor(null)}
            onPointerMove={updateCursor}
          >
            <PresenceCursorLayer participants={selectedWorkspace.participants} />
            <div className="playsay-teacher-live-editor-header">
              <strong>
                {isGroupCollaborationDocument(selectedDocument)
                  ? t("classroom.collaboration.groupDocument")
                  : collaborationDocumentDisplayName(selectedDocument, t("classroom.collaboration.studentDocument"))}
              </strong>
              <span>{t("classroom.collaboration.version", { version: selectedDocument.version })}</span>
            </div>
            <textarea
              aria-label={isGroupCollaborationDocument(selectedDocument)
                ? t("classroom.collaboration.groupDocument")
                : collaborationDocumentDisplayName(selectedDocument, t("classroom.collaboration.studentDocument"))}
              onChange={(event) => selectedWorkspace.updateText(event.target.value)}
              placeholder={t("classroom.collaboration.editorPlaceholder")}
              value={selectedWorkspace.text}
            />
          </div>
        ) : null}

        <div className="playsay-collaboration-student-list">
          {participants.length === 0 ? (
            <span className="playsay-collaboration-empty">{t("classroom.collaboration.noStudents")}</span>
          ) : (
            participants.map((participant) => {
              const participantDocument = individualDocuments.find((document) => document.studentSubject === participant.subject);
              return (
                <button
                  className="playsay-collaboration-student-row"
                  data-active={participantDocument && selectedDocument?.id === participantDocument.id ? "true" : "false"}
                  disabled={!participantDocument}
                  key={participant.subject}
                  onClick={() => participantDocument ? setSelectedDocumentId(participantDocument.id) : undefined}
                  type="button"
                >
                  <span>
                    {participant.displayName ?? participant.username ?? participant.subject}
                  </span>
                  <small data-state={participantDocument ? collaborationDocumentStatus(participantDocument) : "empty"}>
                    {participantDocument
                      ? formatCollaborationUpdatedAt(participantDocument.updatedAt, i18n.resolvedLanguage ?? i18n.language)
                      : t("classroom.collaboration.notStarted")}
                  </small>
                </button>
              );
            })
          )}
        </div>

        <div className="playsay-collaboration-recent-list">
          {latestDocuments.length === 0 ? (
            <span className="playsay-collaboration-empty">{t("classroom.collaboration.noDocuments")}</span>
          ) : (
            latestDocuments.slice(0, 5).map((document) => (
              <button
                className="playsay-collaboration-recent-pill"
                data-active={selectedDocument?.id === document.id ? "true" : "false"}
                key={document.id}
                onClick={() => setSelectedDocumentId(document.id)}
                type="button"
              >
                {isGroupCollaborationDocument(document)
                  ? t("classroom.collaboration.group")
                  : collaborationDocumentDisplayName(document, t("classroom.collaboration.studentDocument"))}
                <small>{t("classroom.collaboration.version", { version: document.version })}</small>
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
