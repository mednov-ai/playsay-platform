import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, BookOpen, CalendarClock, Check, CircleAlert, Copy, Loader2, Play, Users } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { formatDateTime } from "../../../entities/schedule/model";
import type { LessonMaterial, ScheduledLesson } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

const MaterialPlayPreviewDialog = lazy(() => (
  import("../../materials/ui/MaterialPlayPreviewDialog").then((module) => ({ default: module.MaterialPlayPreviewDialog }))
));

export function LessonPreparationPanel({
  disabled,
  lesson,
  materials,
  message,
  onAssignMaterial,
  onBack,
  onCopyLinks,
  onOpenMaterials,
  onStart,
}: {
  disabled: boolean;
  lesson: ScheduledLesson;
  materials: LessonMaterial[];
  message: string | null;
  onAssignMaterial: (lessonId: string, materialId: string | null) => Promise<ScheduledLesson | null>;
  onBack: () => void;
  onCopyLinks: (lesson: ScheduledLesson) => Promise<boolean>;
  onOpenMaterials: () => void;
  onStart: (lesson: ScheduledLesson) => Promise<void>;
}) {
  const { t } = useAppTranslation();
  const [currentLesson, setCurrentLesson] = useState(lesson);
  const [previewMaterial, setPreviewMaterial] = useState<LessonMaterial | null>(null);
  const [linksCopied, setLinksCopied] = useState(false);
  const activeMaterials = materials.filter((material) => material.status !== "ARCHIVED");
  const selectedMaterial = activeMaterials.find((material) => material.id === currentLesson.materialId) ?? null;
  const translate = (key: string, options?: Record<string, unknown>) => t(key, options);
  const isClosed = currentLesson.status === "COMPLETED" || currentLesson.status === "CANCELLED";

  useEffect(() => setCurrentLesson(lesson), [lesson]);

  async function assignMaterial(materialId: string) {
    const updated = await onAssignMaterial(currentLesson.id, materialId || null);
    if (updated) {
      setCurrentLesson(updated);
    }
  }

  async function copyLinks() {
    if (await onCopyLinks(currentLesson)) {
      setLinksCopied(true);
      window.setTimeout(() => setLinksCopied(false), 1800);
    }
  }

  return (
    <section className="playsay-preparation-shell">
      <header className="playsay-preparation-header">
        <Button onClick={onBack} type="button" variant="outline">
          <ArrowLeft className="h-4 w-4" />{t("schedule.preparation.back")}
        </Button>
        <div>
          <span>{t("schedule.preparation.eyebrow")}</span>
          <h1>{currentLesson.lessonTitle ?? currentLesson.courseTitle ?? t("schedule.lessonFallbackTitle")}</h1>
          <p>{t("schedule.preparation.subtitle")}</p>
        </div>
        <Button disabled={disabled || isClosed} onClick={() => void onStart(currentLesson)} type="button">
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {currentLesson.status === "IN_PROGRESS" ? t("schedule.preparation.enterLesson") : t("schedule.preparation.startLesson")}
        </Button>
      </header>

      {message ? <div className="playsay-schedule-message">{message}</div> : null}

      <div className="playsay-preparation-grid">
        <main className="playsay-preparation-main">
          <div className="playsay-preparation-section-head">
            <div>
              <span>{t("schedule.preparation.materialEyebrow")}</span>
              <h2>{t("schedule.preparation.materialTitle")}</h2>
            </div>
            {selectedMaterial ? (
              <Button onClick={() => setPreviewMaterial(selectedMaterial)} type="button" variant="outline">
                <BookOpen className="h-4 w-4" />{t("schedule.preparation.preview")}
              </Button>
            ) : null}
          </div>
          <div className="playsay-preparation-material-picker">
            <select
              className="playsay-input"
              disabled={disabled || isClosed}
              onChange={(event) => void assignMaterial(event.target.value)}
              value={currentLesson.materialId ?? ""}
            >
              <option value="">{t("schedule.form.noMaterial")}</option>
              {activeMaterials.map((material) => <option key={material.id} value={material.id}>{material.title}</option>)}
            </select>
            {selectedMaterial ? (
              <div className="playsay-preparation-material-card">
                <BookOpen className="h-6 w-6" />
                <div>
                  <strong>{selectedMaterial.title}</strong>
                  <span>{selectedMaterial.cefrLevel} · {t("schedule.wizard.blocks", { count: selectedMaterial.blockCount })}</span>
                </div>
                <Check className="h-5 w-5" />
              </div>
            ) : (
              <div className="playsay-preparation-empty-material">
                <CircleAlert className="h-6 w-6" />
                <div><strong>{t("schedule.preparation.noMaterialTitle")}</strong><span>{t("schedule.preparation.noMaterialSubtitle")}</span></div>
                <Button onClick={onOpenMaterials} type="button" variant="outline">{t("schedule.wizard.createMaterial")}</Button>
              </div>
            )}
          </div>
        </main>

        <aside className="playsay-preparation-sidebar">
          <section>
            <h2>{t("schedule.preparation.summaryTitle")}</h2>
            <dl>
              <div><dt><CalendarClock className="h-4 w-4" />{t("schedule.preparation.time")}</dt><dd>{formatDateTime(currentLesson.scheduledStart, translate)} — {formatDateTime(currentLesson.scheduledEnd, translate)}</dd></div>
              <div><dt><Users className="h-4 w-4" />{t("schedule.form.students")}</dt><dd>{currentLesson.participants.map((participant) => participant.displayName ?? participant.username ?? participant.subject).join(", ") || t("schedule.participants.none")}</dd></div>
            </dl>
          </section>
          <section>
            <h2>{t("schedule.preparation.checklistTitle")}</h2>
            <ul className="playsay-preparation-checklist">
              <li data-ready={currentLesson.participants.length > 0 ? "true" : "false"}><Check />{t("schedule.preparation.studentsReady")}</li>
              <li data-ready={selectedMaterial ? "true" : "false"}><Check />{t("schedule.preparation.materialReady")}</li>
              <li data-ready="true"><Check />{t("schedule.preparation.videoReady")}</li>
            </ul>
          </section>
          <Button disabled={disabled || currentLesson.participants.length === 0} onClick={() => void copyLinks()} type="button" variant="outline">
            <Copy className="h-4 w-4" />{linksCopied ? t("schedule.clipboard.copied") : t("schedule.preparation.copyLinks")}
          </Button>
        </aside>
      </div>

      {previewMaterial ? (
        <Suspense fallback={null}>
          <MaterialPlayPreviewDialog material={previewMaterial} onClose={() => setPreviewMaterial(null)} open />
        </Suspense>
      ) : null}
    </section>
  );
}
