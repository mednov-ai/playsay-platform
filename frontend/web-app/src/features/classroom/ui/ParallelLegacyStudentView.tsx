import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/ui/button";
import { fetchParallelStudentLegacyAnnotations, isApiStatus, type LessonMaterial } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { annotationContentFromJson, type AnnotationContent } from "../model/annotation";
import { LessonTaskCanvas } from "./LessonTaskCanvas";

export function ParallelLegacyStudentView({ lessonId, material, studentSubject, teacherName }: {
  lessonId: string; material: LessonMaterial; studentSubject: string; teacherName: string;
}) {
  const { t } = useAppTranslation();
  const [content, setContent] = useState<AnnotationContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refreshRef = useRef<(() => void) | null>(null);
  const fingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await fetchParallelStudentLegacyAnnotations(lessonId, material.id, studentSubject);
        if (cancelled) return;
        const next = result ? annotationContentFromJson(result.content) : null;
        const fingerprint = JSON.stringify(next);
        if (fingerprintRef.current !== fingerprint) { fingerprintRef.current = fingerprint; setContent(next); }
        setError(false);
      } catch (caught) {
        if (!cancelled) {
          const changedAccount = typeof caught === "object" && caught !== null && "errorCode" in caught && caught.errorCode === "SESSION_CHANGED";
          if (changedAccount || [401, 403, 404].some((status) => isApiStatus(caught, status))) {
            fingerprintRef.current = null;
            setContent(null);
          }
          setError(true);
        }
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    }
    refreshRef.current = () => { void refresh(); };
    void refresh();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 2_000);
    return () => { cancelled = true; window.clearInterval(interval); refreshRef.current = null; };
  }, [lessonId, material.id, studentSubject]);

  return (
    <section aria-label={t("classroom.parallelLegacy.title")}>
      <div className="playsay-lesson-inline-message">
        <strong>{t("classroom.parallelLegacy.title")}</strong>{" "}<span>{t("classroom.parallelLegacy.description")}</span>
      </div>
      {loading ? <div role="status">{t("classroom.material.loading")}</div> : null}
      {error ? <div role="alert">{t("classroom.parallelLegacy.error")}{" "}
        <Button className="min-h-11" type="button" variant="outline" onClick={() => refreshRef.current?.()}>{t("classroom.collaborationRecovery.retry")}</Button>
      </div> : null}
      {!loading && !error && !content ? <div role="status">{t("classroom.parallelLegacy.empty")}</div> : null}
      {content ? <LessonTaskCanvas
        canControlPages lessonId={lessonId} material={material} onSaveAnswers={() => undefined}
        readOnlyAnnotation={content} score={null} submission={null} submissionMessage={null}
        submissionSaving={false} teacherName={teacherName}
      /> : null}
    </section>
  );
}
