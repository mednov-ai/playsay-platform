import { useEffect, useState } from "react";
import {
  appendScheduledLessonImagePage,
  appendScheduledLessonHtmlGamePage,
  fetchScheduledLessonMaterial,
  type LessonMaterial,
  type LiveLessonImagePageResult,
  type LiveLessonHtmlGamePageResult,
  type ScheduledLesson,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
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
  const [liveActivePageId, setLiveActivePageId] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedMaterialId(session.materialId ?? "");
  }, [session.materialId]);

  useEffect(() => {
    if (
      assignmentMessage !== t("classroom.messages.materialAssigned") &&
      assignmentMessage !== t("classroom.messages.imagePageAdded") &&
      assignmentMessage !== t("classroom.messages.htmlGamePageAdded") &&
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

      const lessonMaterial = await fetchScheduledLessonMaterial(session.lessonId);
      setMaterial(lessonMaterial);
      setMaterialError(null);
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
    setUploadingHtmlGamePage(true);
    setAssignmentMessage(null);
    try {
      const result = await appendScheduledLessonHtmlGamePage(session.lessonId, file);
      setMaterial(result.material);
      setSelectedMaterialId(result.lesson.materialId ?? result.material.id);
      setLiveActivePageId(result.activePageId);
      setMaterialError(null);
      setAssignmentMessage(t("classroom.messages.htmlGamePageAdded"));
      return result;
    } catch (caught) {
      setAssignmentMessage(caught instanceof Error ? caught.message : t("classroom.messages.htmlGamePageUploadFailed"));
      return null;
    } finally {
      setUploadingHtmlGamePage(false);
    }
  }

  return {
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
  };
}
