import { useEffect, useState } from "react";
import {
  fetchScheduledLessonMaterialSubmission,
  fetchScheduledLessonMaterialSubmissions,
  saveScheduledLessonMaterialSubmission,
  type LessonMaterial,
  type LessonMaterialJson,
  type LessonMaterialSubmission,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import type { LessonRoomSession } from "../model/session";

export function useLessonSubmission({
  canMonitorSubmissions,
  material,
  session,
}: {
  canMonitorSubmissions: boolean;
  material: LessonMaterial | null;
  session: LessonRoomSession;
}) {
  const { t } = useAppTranslation();
  const [submission, setSubmission] = useState<LessonMaterialSubmission | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [submissionSaving, setSubmissionSaving] = useState(false);
  const [submissionSnapshots, setSubmissionSnapshots] = useState<LessonMaterialSubmission[]>([]);
  const [submissionMonitorError, setSubmissionMonitorError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.materialId || canMonitorSubmissions) {
      setSubmission(null);
      setSubmissionMessage(null);
      return undefined;
    }

    let cancelled = false;

    async function loadSubmission() {
      try {
        const savedSubmission = await fetchScheduledLessonMaterialSubmission(session.lessonId);
        if (!cancelled) {
          setSubmission(savedSubmission);
        }
      } catch (caught) {
        if (!cancelled) {
          setSubmission(null);
          setSubmissionMessage(caught instanceof Error ? caught.message : t("classroom.messages.submissionLoadFailed"));
        }
      }
    }

    void loadSubmission();
    return () => {
      cancelled = true;
    };
  }, [canMonitorSubmissions, session.lessonId, session.materialId]);

  useEffect(() => {
    if (!canMonitorSubmissions || !material?.id) {
      setSubmissionSnapshots([]);
      setSubmissionMonitorError(null);
      return undefined;
    }

    let cancelled = false;

    async function loadSubmissionSnapshots() {
      try {
        const snapshots = await fetchScheduledLessonMaterialSubmissions(session.lessonId);
        if (!cancelled) {
          setSubmissionSnapshots(snapshots);
          setSubmissionMonitorError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setSubmissionSnapshots([]);
          setSubmissionMonitorError(caught instanceof Error ? caught.message : t("classroom.messages.submissionsLoadFailed"));
        }
      }
    }

    void loadSubmissionSnapshots();
    const intervalId = window.setInterval(() => {
      void loadSubmissionSnapshots();
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [canMonitorSubmissions, material?.id, session.lessonId]);

  async function saveMaterialAnswers(content: LessonMaterialJson) {
    setSubmissionSaving(true);
    setSubmissionMessage(null);
    try {
      const savedSubmission = await saveScheduledLessonMaterialSubmission(session.lessonId, {
        content,
        submitted: true,
      });
      setSubmission(savedSubmission);
      setSubmissionMessage(t("classroom.messages.answerSent"));
    } catch (caught) {
      setSubmissionMessage(caught instanceof Error ? caught.message : t("classroom.messages.answerSendFailed"));
    } finally {
      setSubmissionSaving(false);
    }
  }

  function registerSubmission(savedSubmission: LessonMaterialSubmission) {
    setSubmission(savedSubmission);
    setSubmissionMessage(t("classroom.collaboration.finalized"));
  }

  return {
    registerSubmission,
    saveMaterialAnswers,
    submission,
    submissionMessage,
    submissionMonitorError,
    submissionSaving,
    submissionSnapshots,
  };
}
