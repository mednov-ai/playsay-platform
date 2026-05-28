import { useEffect, useState } from "react";
import {
  fetchScheduledLessonMaterial,
  type LessonMaterial,
  type ScheduledLesson,
} from "../../../shared/api/playsay";
import type { LessonRoomSession } from "../model/session";

export function useLessonMaterial({
  onAssignMaterial,
  session,
}: {
  onAssignMaterial: (lessonId: string, materialId: string | null) => Promise<ScheduledLesson | null>;
  session: LessonRoomSession;
}) {
  const [material, setMaterial] = useState<LessonMaterial | null>(null);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState(session.materialId ?? "");
  const [assigningMaterial, setAssigningMaterial] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedMaterialId(session.materialId ?? "");
  }, [session.materialId]);

  useEffect(() => {
    if (assignmentMessage !== "Материал назначен" && assignmentMessage !== "Материал снят") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setAssignmentMessage(null), 2_500);
    return () => window.clearTimeout(timeoutId);
  }, [assignmentMessage]);

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
          setMaterialError(caught instanceof Error ? caught.message : "Не удалось загрузить материал");
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
  }, [session.lessonId, session.materialId]);

  async function assignMaterial() {
    setAssigningMaterial(true);
    setAssignmentMessage(null);
    try {
      const updated = await onAssignMaterial(session.lessonId, selectedMaterialId || null);
      if (!updated) {
        setAssignmentMessage("Материал не назначен");
        return;
      }

      if (!updated.materialId) {
        setMaterial(null);
        setMaterialError(null);
        setAssignmentMessage("Материал снят");
        return;
      }

      const lessonMaterial = await fetchScheduledLessonMaterial(session.lessonId);
      setMaterial(lessonMaterial);
      setMaterialError(null);
      setAssignmentMessage("Материал назначен");
    } catch (caught) {
      setAssignmentMessage(caught instanceof Error ? caught.message : "Не удалось назначить материал");
    } finally {
      setAssigningMaterial(false);
    }
  }

  return {
    assigningMaterial,
    assignmentMessage,
    assignMaterial,
    material,
    materialError,
    materialLoading,
    selectedMaterialId,
    setSelectedMaterialId,
  };
}
