import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchHomeworkAssignment,
  fetchHomeworkAssignments,
  fetchMyHomeworkAssignment,
  fetchMyHomeworkAssignments,
  saveMyHomeworkAssignmentSubmission,
  type HomeworkAssignment,
  type HomeworkAssignmentDetail,
  type HomeworkSubmission,
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
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [draftSaveNonce, setDraftSaveNonce] = useState(0);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pendingDraftSaveRef = useRef<Promise<HomeworkSubmission> | null>(null);

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
          setSelectedAssignmentId((current) => {
            if (current && items.some((item) => item.id === current)) {
              return current;
            }
            return canManage ? items[0]?.id ?? null : null;
          });
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
      setAnswers({});
      setDraftSaveState("idle");
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
            setAssignments((current) => current.map((assignment) => (
              assignment.id === assignmentId
                ? {
                    ...assignment,
                    myScore: loaded.submission.score,
                    mySubmissionState: loaded.submission.submittedAt ? "SUBMITTED" : "DRAFT",
                    mySubmittedAt: loaded.submission.submittedAt,
                    mySubmissionUpdatedAt: loaded.submission.updatedAt,
                  }
                : assignment
            )));
            setDraftSaveState("idle");
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
    if (studentDetail.submission.submittedAt) {
      return studentDetail.submission.score ?? null;
    }
    const savedAnswers = JSON.stringify(materialAnswersFromSubmission(studentDetail.submission));
    const currentAnswers = JSON.stringify(answers);
    const liveScore = materialLiveScore(studentDetail.material, answers);
    return currentAnswers !== savedAnswers && liveScore !== null
      ? liveScore
      : studentDetail.submission.score ?? liveScore;
  }, [answers, studentDetail?.assignment.id, studentDetail?.submission.updatedAt]);
  const savedStudentAnswers = useMemo(
    () => studentDetail ? materialAnswersFromSubmission(studentDetail.submission) : {},
    [studentDetail?.assignment.id, studentDetail?.submission.updatedAt],
  );
  const studentHasUnsavedChanges = studentDetail !== null
    && JSON.stringify(answers) !== JSON.stringify(savedStudentAnswers);

  useEffect(() => {
    if (
      canManage
      || !studentDetail
      || !studentHasUnsavedChanges
      || studentDetail.submission.submittedAt
      || saving
    ) {
      return undefined;
    }

    let active = true;
    const assignmentId = studentDetail.assignment.id;
    const materialId = studentDetail.material.id;
    const timeoutId = window.setTimeout(() => {
      setDraftSaving(true);
      setDraftSaveState("idle");
      const request = saveMyHomeworkAssignmentSubmission(assignmentId, {
        content: homeworkSubmissionContent(materialId, answers),
        submitted: false,
      });
      pendingDraftSaveRef.current = request;
      request
        .then((saved) => {
          if (!active) return;
          setStudentDetail((current) => (
            current?.assignment.id === assignmentId ? { ...current, submission: saved } : current
          ));
          setAssignments((current) => current.map((assignment) => (
            assignment.id === assignmentId
              ? {
                  ...assignment,
                  myScore: saved.score,
                  mySubmissionState: "DRAFT",
                  mySubmissionUpdatedAt: saved.updatedAt,
                }
              : assignment
          )));
          setDraftSaveState("saved");
        })
        .catch(() => {
          if (active) {
            setDraftSaveState("error");
          }
        })
        .finally(() => {
          if (pendingDraftSaveRef.current === request) {
            pendingDraftSaveRef.current = null;
          }
          if (active) {
            setDraftSaving(false);
          }
        });
    }, 1_000);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [
    answers,
    canManage,
    draftSaveNonce,
    saving,
    studentDetail?.assignment.id,
    studentDetail?.submission.submittedAt,
    studentHasUnsavedChanges,
  ]);

  async function refreshAssignments() {
    if (!profile) {
      return;
    }
    setLoading(true);
    try {
      const items = canManage ? await fetchHomeworkAssignments() : await fetchMyHomeworkAssignments();
      const nextSelectedId = selectedAssignmentId && items.some((item) => item.id === selectedAssignmentId)
        ? selectedAssignmentId
        : canManage ? items[0]?.id ?? null : null;
      setAssignments(items);
      setSelectedAssignmentId(nextSelectedId);
      if (nextSelectedId && canManage) {
        const loaded = await fetchHomeworkAssignment(nextSelectedId);
        setDetail(loaded);
        setStudentDetail(null);
      } else {
        setDetail(null);
        if (!nextSelectedId) {
          setStudentDetail(null);
        }
      }
      setLastLoadedAt(new Date().toISOString());
      setMessage(null);
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
      await pendingDraftSaveRef.current?.catch(() => undefined);
      const saved = await saveMyHomeworkAssignmentSubmission(studentDetail.assignment.id, {
        content: homeworkSubmissionContent(studentDetail.material.id, answers),
        submitted: true,
      });
      setStudentDetail({ ...studentDetail, submission: saved });
      setAssignments((current) => current.map((assignment) => (
        assignment.id === studentDetail.assignment.id
          ? {
              ...assignment,
              myScore: saved.score,
              mySubmissionState: "SUBMITTED",
              mySubmittedAt: saved.submittedAt,
              mySubmissionUpdatedAt: saved.updatedAt,
            }
          : assignment
      )));
      setDraftSaveState("idle");
      setMessage(null);
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
    draftSaveState,
    draftSaving,
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
    studentHasUnsavedChanges,
    studentScore,
    submitStudentHomework,
    retryStudentDraftSave: () => setDraftSaveNonce((current) => current + 1),
    updateAnswer,
  };
}

function homeworkSubmissionContent(materialId: string, answers: MaterialAnswerState): LessonMaterialJson {
  return {
    schemaVersion: 1,
    materialId,
    answers,
  };
}
