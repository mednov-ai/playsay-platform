import { useEffect, useMemo, useState } from "react";
import {
  fetchHomeworkAssignment,
  fetchHomeworkAssignments,
  fetchMyHomeworkAssignment,
  fetchMyHomeworkAssignments,
  saveMyHomeworkAssignmentSubmission,
  type HomeworkAssignment,
  type HomeworkAssignmentDetail,
  type LessonMaterialJson,
  type MeProfile,
  type StudentHomeworkDetail,
} from "../../../shared/api/playsay";
import {
  materialAnswersFromSubmission,
  materialLiveScore,
  type MaterialAnswerBlock,
  type MaterialAnswerState,
} from "../../materials";
import { useAppTranslation } from "../../../shared/i18n";

export function useHomeworkAssignments({
  canManage,
  profile,
}: {
  canManage: boolean;
  profile: MeProfile | null;
}) {
  const { t } = useAppTranslation();
  const [assignments, setAssignments] = useState<HomeworkAssignment[]>([]);
  const [detail, setDetail] = useState<HomeworkAssignmentDetail | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentHomeworkDetail | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<MaterialAnswerState>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedAssignment = assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;

  useEffect(() => {
    if (!profile) {
      setAssignments([]);
      setDetail(null);
      setStudentDetail(null);
      setSelectedAssignmentId(null);
      return undefined;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const items = canManage ? await fetchHomeworkAssignments() : await fetchMyHomeworkAssignments();
        if (!cancelled) {
          setAssignments(items);
          setSelectedAssignmentId((current) => current ?? items[0]?.id ?? null);
          setLastLoadedAt(new Date().toISOString());
          setMessage(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setAssignments([]);
          setMessage(caught instanceof Error ? caught.message : t("homework.messages.loadFailed"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [canManage, profile?.subject]);

  useEffect(() => {
    if (!selectedAssignmentId) {
      setDetail(null);
      setStudentDetail(null);
      return undefined;
    }

    let cancelled = false;
    const assignmentId = selectedAssignmentId;

    async function loadDetail() {
      setLoading(true);
      try {
        if (canManage) {
          const loaded = await fetchHomeworkAssignment(assignmentId);
          if (!cancelled) {
            setDetail(loaded);
            setStudentDetail(null);
            setLastLoadedAt(new Date().toISOString());
          }
        } else {
          const loaded = await fetchMyHomeworkAssignment(assignmentId);
          if (!cancelled) {
            setStudentDetail(loaded);
            setDetail(null);
            setAnswers(materialAnswersFromSubmission(loaded.submission));
            setLastLoadedAt(new Date().toISOString());
          }
        }
        if (!cancelled) {
          setMessage(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setDetail(null);
          setStudentDetail(null);
          setMessage(caught instanceof Error ? caught.message : t("homework.messages.detailLoadFailed"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [canManage, selectedAssignmentId]);

  useEffect(() => {
    if (!canManage || !profile || !selectedAssignmentId) {
      return undefined;
    }

    let cancelled = false;
    const assignmentId = selectedAssignmentId;
    const intervalId = window.setInterval(() => {
      Promise.all([fetchHomeworkAssignments(), fetchHomeworkAssignment(assignmentId)])
        .then(([items, loaded]) => {
          if (!cancelled) {
            setAssignments(items);
            setDetail(loaded);
            setLastLoadedAt(new Date().toISOString());
          }
        })
        .catch(() => {
          // Keep the last visible snapshot; the manual refresh button will surface errors.
        });
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [canManage, profile?.subject, selectedAssignmentId]);

  const studentScore = useMemo(() => {
    if (!studentDetail) {
      return null;
    }
    const savedAnswers = JSON.stringify(materialAnswersFromSubmission(studentDetail.submission));
    const currentAnswers = JSON.stringify(answers);
    const liveScore = materialLiveScore(studentDetail.material, answers);
    return currentAnswers !== savedAnswers && liveScore !== null
      ? liveScore
      : studentDetail.submission.score ?? liveScore;
  }, [answers, studentDetail?.assignment.id, studentDetail?.submission.updatedAt]);

  async function refreshAssignments() {
    if (!profile) {
      return;
    }
    setLoading(true);
    try {
      const items = canManage ? await fetchHomeworkAssignments() : await fetchMyHomeworkAssignments();
      const nextSelectedId = selectedAssignmentId && items.some((item) => item.id === selectedAssignmentId)
        ? selectedAssignmentId
        : items[0]?.id ?? null;
      setAssignments(items);
      setSelectedAssignmentId(nextSelectedId);
      if (nextSelectedId) {
        if (canManage) {
          const loaded = await fetchHomeworkAssignment(nextSelectedId);
          setDetail(loaded);
          setStudentDetail(null);
        } else {
          const loaded = await fetchMyHomeworkAssignment(nextSelectedId);
          setStudentDetail(loaded);
          setDetail(null);
          setAnswers(materialAnswersFromSubmission(loaded.submission));
        }
      } else {
        setDetail(null);
        setStudentDetail(null);
      }
      setLastLoadedAt(new Date().toISOString());
      setMessage(t("homework.messages.refreshed"));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("homework.messages.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function submitStudentHomework() {
    if (!studentDetail) {
      return;
    }
    setSaving(true);
    try {
      const saved = await saveMyHomeworkAssignmentSubmission(studentDetail.assignment.id, {
        content: {
          schemaVersion: 1,
          materialId: studentDetail.material.id,
          answers,
        } satisfies LessonMaterialJson,
        submitted: true,
      });
      setStudentDetail({ ...studentDetail, submission: saved });
      setMessage(t("homework.messages.submitted"));
      await refreshAssignments();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : t("homework.messages.submitFailed"));
    } finally {
      setSaving(false);
    }
  }

  function updateAnswer(blockId: string, answer: MaterialAnswerBlock) {
    setAnswers((current) => ({
      ...current,
      [blockId]: answer,
    }));
  }

  return {
    answers,
    assignments,
    detail,
    lastLoadedAt,
    loading,
    message,
    refreshAssignments,
    saving,
    selectedAssignment,
    selectedAssignmentId,
    setDetail,
    setMessage,
    setSaving,
    setSelectedAssignmentId,
    studentDetail,
    studentScore,
    submitStudentHomework,
    updateAnswer,
  };
}
