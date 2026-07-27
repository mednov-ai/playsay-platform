import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCurrentCollaborationDocument,
  finalizeCollaborationDocument,
  saveCollaborationDocumentSnapshot,
  type CollaborationDocument,
  type CollaborationDocumentScope,
  type LessonMaterialJson,
  type LessonMaterialSubmission,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { collaborationScopeForMode, type CollaborationWorkspaceMode } from "../model/collaboration";

export function useCollaborationDocument({
  enabled = true,
  lessonId,
  materialId,
  mode,
}: {
  enabled?: boolean;
  lessonId: string;
  materialId?: string | null;
  mode: CollaborationWorkspaceMode;
}) {
  const { t } = useAppTranslation();
  const [document, setDocument] = useState<CollaborationDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);

  const scope = collaborationScopeForMode(mode);
  const activeDocument = document?.scope === scope &&
    document.lessonId === lessonId &&
    document.materialId === materialId
    ? document
    : null;

  const loadCurrentDocument = useCallback(async (invalidDocumentId?: string) => {
    const requestGeneration = ++requestGenerationRef.current;
    if (!enabled || !materialId) {
      setDocument(null);
      setError(null);
      setLoading(false);
      return null;
    }

    setDocument(null);
    setLoading(true);
    setError(null);
    try {
      const nextDocument = await createCurrentCollaborationDocument(lessonId, {
        documentKind: "MATERIAL_WORK",
        materialId,
        scope: scope as CollaborationDocumentScope,
      });
      if (requestGenerationRef.current !== requestGeneration) return null;
      if (invalidDocumentId && nextDocument.id === invalidDocumentId) {
        setError(t("classroom.collaboration.loadFailed"));
        return null;
      }
      setDocument(nextDocument);
      return nextDocument;
    } catch (caught) {
      if (requestGenerationRef.current !== requestGeneration) return null;
      const nextError = caught instanceof Error ? caught.message : t("classroom.collaboration.loadFailed");
      setDocument(null);
      setError(nextError);
      return null;
    } finally {
      if (requestGenerationRef.current === requestGeneration) setLoading(false);
    }
  }, [enabled, lessonId, materialId, scope, t]);

  const refresh = useCallback(
    () => loadCurrentDocument(),
    [loadCurrentDocument],
  );

  const invalidateDocument = useCallback(
    (documentId: string) => {
      if (document?.id !== documentId) return;
      void loadCurrentDocument(documentId);
    },
    [document?.id, loadCurrentDocument],
  );

  useEffect(() => {
    void refresh();
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [refresh]);

  async function saveSnapshot(snapshot: LessonMaterialJson): Promise<CollaborationDocument | null> {
    if (!activeDocument) {
      return null;
    }

    const saved = await saveCollaborationDocumentSnapshot(lessonId, activeDocument.id, { snapshot });
    setDocument(saved);
    return saved;
  }

  async function finalize(snapshot: LessonMaterialJson | null): Promise<LessonMaterialSubmission | null> {
    if (!activeDocument) {
      return null;
    }

    setFinalizing(true);
    setMessage(null);
    try {
      if (snapshot) {
        await saveSnapshot(snapshot);
      }
      const submission = await finalizeCollaborationDocument(lessonId, activeDocument.id, { submitted: true });
      setMessage(t("classroom.collaboration.finalized"));
      return submission;
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("classroom.collaboration.finalizeFailed"));
      return null;
    } finally {
      setFinalizing(false);
    }
  }

  return {
    document: activeDocument,
    error,
    finalizing,
    finalize,
    loading,
    message,
    invalidateDocument,
    refresh,
    saveSnapshot,
    scope,
  };
}
