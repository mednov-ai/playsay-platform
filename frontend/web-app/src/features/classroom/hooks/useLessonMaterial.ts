import { useEffect, useRef, useState } from "react";
import {
  appendScheduledLessonImagePage,
  appendScheduledLessonHtmlGamePage,
  fetchScheduledLessonMaterial,
  saveMaterial,
  type LessonMaterial,
  type LiveLessonImagePageResult,
  type LiveLessonHtmlGamePageResult,
  type ScheduledLesson,
} from "../../../shared/api/playsay";
import { htmlGameUploadErrorMessage, validateHtmlGameUpload } from "../../../shared/api/htmlGameUploadPolicy";
import { useAppTranslation } from "../../../shared/i18n";
import {
  createReadyDocumentMaterial,
  documentFileFingerprint,
  type PendingDocumentMaterialUpload,
} from "../../materials/model/documentUpload";
import type { LessonRoomSession } from "../model/session";

export function useLessonMaterial({
  onAssignMaterial,
  session,
}: {
  onAssignMaterial: (lessonId: string, materialId: string | null) => Promise<ScheduledLesson | null>;
  session: LessonRoomSession;
}) {
  const { t } = useAppTranslation();
  const [material, setMaterial] = useState<LessonMaterial | null>(null);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState(session.materialId ?? "");
  const [assigningMaterial, setAssigningMaterial] = useState(false);
  const [uploadingImagePage, setUploadingImagePage] = useState(false);
  const [uploadingHtmlGamePage, setUploadingHtmlGamePage] = useState(false);
  const [uploadingDocumentPage, setUploadingDocumentPage] = useState(false);
  const [readyDocumentMaterials, setReadyDocumentMaterials] = useState<LessonMaterial[]>([]);
  const documentUploadDraftRef = useRef<PendingDocumentMaterialUpload | null>(null);
  const [liveActivePageId, setLiveActivePageId] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const htmlGameUploadAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      htmlGameUploadAttemptRef.current += 1;
    };
  }, []);

  useEffect(() => {
    setSelectedMaterialId(session.materialId ?? "");
  }, [session.materialId]);

  useEffect(() => {
    if (
      assignmentMessage !== t("classroom.messages.materialAssigned") &&
      assignmentMessage !== t("classroom.messages.imagePageAdded") &&
      assignmentMessage !== t("classroom.messages.htmlGamePageAdded") &&
      assignmentMessage !== t("classroom.messages.documentPageAdded") &&
      assignmentMessage !== t("materials.document.uploadReady") &&
      assignmentMessage !== t("classroom.messages.materialUnassigned")
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setAssignmentMessage(null), 2_500);
    return () => window.clearTimeout(timeoutId);
  }, [assignmentMessage, t]);

  useEffect(() => {
    if (!session.materialId) {
      setMaterial(null);
      setMaterialError(null);
      setMaterialLoading(false);
      return undefined;
    }

    setMaterial((current) => current?.id === session.materialId ? current : null);
    let cancelled = false;

    async function loadMaterial() {
      setMaterialLoading(true);
      setMaterialError(null);
      try {
        const lessonMaterial = await fetchScheduledLessonMaterial(session.lessonId);
        if (!cancelled) {
          setMaterial(lessonMaterial);
        }
      } catch (caught) {
        if (!cancelled) {
          setMaterial(null);
          setMaterialError(caught instanceof Error ? caught.message : t("classroom.messages.materialLoadFailed"));
        }
      } finally {
        if (!cancelled) {
          setMaterialLoading(false);
        }
      }
    }

    void loadMaterial();
    return () => {
      cancelled = true;
    };
  }, [session.lessonId, session.lessonUpdatedAt, session.materialId]);

  async function assignMaterial() {
    setAssigningMaterial(true);
    setAssignmentMessage(null);
    setLiveActivePageId(null);
    try {
      const updated = await onAssignMaterial(session.lessonId, selectedMaterialId || null);
      if (!updated) {
        setAssignmentMessage(t("classroom.messages.materialNotAssigned"));
        return;
      }

      if (!updated.materialId) {
        setMaterial(null);
        setMaterialError(null);
        setAssignmentMessage(t("classroom.messages.materialUnassigned"));
        return;
      }

      setAssignmentMessage(t("classroom.messages.materialAssigned"));
    } catch (caught) {
      setAssignmentMessage(caught instanceof Error ? caught.message : t("classroom.messages.materialAssignFailed"));
    } finally {
      setAssigningMaterial(false);
    }
  }

  async function uploadImagePage(file: File): Promise<LiveLessonImagePageResult | null> {
    setUploadingImagePage(true);
    setAssignmentMessage(null);
    try {
      const result = await appendScheduledLessonImagePage(session.lessonId, file, file.name);
      setMaterial(result.material);
      setSelectedMaterialId(result.lesson.materialId ?? result.material.id);
      setLiveActivePageId(result.activePageId);
      setMaterialError(null);
      setAssignmentMessage(t("classroom.messages.imagePageAdded"));
      return result;
    } catch (caught) {
      setAssignmentMessage(caught instanceof Error ? caught.message : t("classroom.messages.imagePageUploadFailed"));
      return null;
    } finally {
      setUploadingImagePage(false);
    }
  }

  async function uploadHtmlGamePage(file: File): Promise<LiveLessonHtmlGamePageResult | null> {
    const attempt = ++htmlGameUploadAttemptRef.current;
    setUploadingHtmlGamePage(true);
    setAssignmentMessage(null);
    try {
      validateHtmlGameUpload(file);
      const result = await appendScheduledLessonHtmlGamePage(session.lessonId, file);
      if (!mountedRef.current || htmlGameUploadAttemptRef.current !== attempt) return null;
      setMaterial(result.material);
      setSelectedMaterialId(result.lesson.materialId ?? result.material.id);
      setLiveActivePageId(result.activePageId);
      setMaterialError(null);
      setAssignmentMessage(t("classroom.messages.htmlGamePageAdded"));
      return result;
    } catch (caught) {
      if (mountedRef.current && htmlGameUploadAttemptRef.current === attempt) {
        setAssignmentMessage(htmlGameUploadErrorMessage(caught));
      }
      return null;
    } finally {
      if (mountedRef.current && htmlGameUploadAttemptRef.current === attempt) {
        setUploadingHtmlGamePage(false);
      }
    }
  }

  async function uploadDocumentPage(file: File): Promise<LessonMaterial | null> {
    setUploadingDocumentPage(true);
    setAssignmentMessage(null);
    try {
      const fileFingerprint = documentFileFingerprint(file);
      const pending = documentUploadDraftRef.current?.fileFingerprint === fileFingerprint
        ? documentUploadDraftRef.current
        : null;
      const ready = await createReadyDocumentMaterial({
        file,
        onPending: (nextPending) => { documentUploadDraftRef.current = nextPending; },
        pending,
        save: (input, materialId) => saveMaterial(input, materialId),
        titleFallback: t("materials.defaults.materialTitle"),
      });
      setReadyDocumentMaterials((current) => [ready, ...current.filter((item) => item.id !== ready.id)]);
      setSelectedMaterialId(ready.id);
      setAssignmentMessage(t("materials.document.uploadReady"));
      documentUploadDraftRef.current = null;
      return ready;
    } catch (caught) {
      setAssignmentMessage(caught instanceof Error ? caught.message : t("materials.document.uploadFailed"));
      return null;
    } finally {
      setUploadingDocumentPage(false);
    }
  }

  return {
    assigningMaterial,
    assignmentMessage,
    assignMaterial,
    material,
    materialError,
    materialLoading,
    readyDocumentMaterials,
    liveActivePageId,
    selectedMaterialId,
    setSelectedMaterialId,
    uploadImagePage,
    uploadHtmlGamePage,
    uploadDocumentPage,
    uploadingImagePage,
    uploadingHtmlGamePage,
    uploadingDocumentPage,
  };
}
