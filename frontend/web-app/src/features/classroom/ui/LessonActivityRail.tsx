import { BookOpen, Check, ChevronRight, CircleHelp, Home, Pause, Play, Square, Users, Wifi, WifiOff, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  createVocabularyHomeworkAssignment,
  createVocabularyPractice,
  giveVocabularyPracticeHint,
  updateVocabularyPracticeStatus,
  type LessonMaterial,
  type VocabularyPractice,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { PersonalPracticeComposer, type PersonalPracticeOwner } from "../../vocabulary/ui/PersonalPracticeComposer";
import { TeacherAddMaterialMenu } from "./TeacherLessonToolbar";

export function LessonActivityRail({
  assigningMaterial,
  currentMaterialId,
  lessonId,
  materials,
  onAssignMaterial,
  onClose,
  onPracticeChange,
  onSelectMaterial,
  onSelectStudent,
  onUploadHtmlGamePage,
  onUploadImagePage,
  open,
  owners,
  practice,
  selectedMaterialId,
  selectedStudentSubject,
  uploadingHtmlGamePage,
  uploadingImagePage,
}: {
  assigningMaterial: boolean;
  currentMaterialId: string | null;
  lessonId: string;
  materials: LessonMaterial[];
  onAssignMaterial: () => void;
  onClose: () => void;
  onPracticeChange: (practice: VocabularyPractice | null) => void;
  onSelectMaterial: (materialId: string) => void;
  onSelectStudent: (subject: string) => void;
  onUploadHtmlGamePage: (file: File) => void;
  onUploadImagePage: (file: File) => void;
  open: boolean;
  owners: PersonalPracticeOwner[];
  practice: VocabularyPractice | null;
  selectedMaterialId: string;
  selectedStudentSubject: string | null;
  uploadingHtmlGamePage: boolean;
  uploadingImagePage: boolean;
}) {
  const { t } = useAppTranslation();
  const [tab, setTab] = useState<"MATERIALS" | "PERSONAL">("PERSONAL");
  const [saving, setSaving] = useState(false);
  const [continuedHome, setContinuedHome] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const selectedSession = practice?.sessions.find((session) => session.ownerSubject === selectedStudentSubject)
    ?? practice?.sessions[0]
    ?? null;

  async function changeStatus(status: "ACTIVE" | "PAUSED" | "COMPLETED") {
    if (!practice) return;
    setSaving(true);
    try {
      onPracticeChange(await updateVocabularyPracticeStatus(practice.id, status));
      setDeliveryError(null);
    } catch (caught) {
      setDeliveryError(caught instanceof Error ? caught.message : t("vocabulary.live.deliveryDelayed"));
    } finally {
      setSaving(false);
    }
  }

  async function hint() {
    if (!practice || !selectedSession) return;
    setSaving(true);
    try {
      const updated = await giveVocabularyPracticeHint(selectedSession.id);
      onPracticeChange({
        ...practice,
        sessions: practice.sessions.map((session) => session.id === updated.id ? updated : session),
      });
    } finally {
      setSaving(false);
    }
  }

  async function continueHome() {
    if (!practice) return;
    const remaining = practice.sessions.filter((session) => session.completedItems < session.totalItems);
    if (!remaining.length) return;
    setSaving(true);
    try {
      await createVocabularyHomeworkAssignment({
        mode: practice.mode,
        sourcePracticeId: practice.id,
        studentSubjects: remaining.map((session) => session.ownerSubject),
        title: t("vocabulary.live.homeworkTitle"),
        wordLimit: 30,
      });
      setContinuedHome(true);
      setDeliveryError(null);
    } catch (caught) {
      setDeliveryError(caught instanceof Error ? caught.message : t("vocabulary.live.deliveryDelayed"));
    } finally {
      setSaving(false);
    }
  }

  async function closePractice(continueAtHome: boolean) {
    if (!practice) return;
    setSaving(true);
    setDeliveryError(null);
    try {
      const completed = await updateVocabularyPracticeStatus(practice.id, "COMPLETED");
      onPracticeChange(completed);
      setClosing(false);
      if (!continueAtHome) return;
      const remaining = completed.sessions.filter((session) => session.completedItems < session.totalItems);
      if (!remaining.length) return;
      await createVocabularyHomeworkAssignment({
        completionPolicy: "MEANINGFUL_ACTIVITY",
        mode: completed.mode,
        sourcePracticeId: completed.id,
        studentSubjects: remaining.map((session) => session.ownerSubject),
        title: t("vocabulary.live.homeworkTitle"),
        wordLimit: 30,
      });
      setContinuedHome(true);
    } catch (caught) {
      setDeliveryError(caught instanceof Error ? caught.message : t("vocabulary.live.deliveryDelayed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {open ? <button aria-label={t("common.actions.close")} className="playsay-activity-rail-backdrop" onClick={onClose} type="button" /> : null}
      <aside aria-label={t("classroom.activityRail.aria")} className="playsay-activity-rail" data-open={open ? "true" : "false"}>
        <header className="flex items-center justify-between gap-2 border-b border-border p-3">
          <strong>{practice ? t("vocabulary.live.supervision") : t("classroom.activityRail.title")}</strong>
          <Button aria-label={t("common.actions.close")} className="h-9 w-9 px-0" onClick={onClose} type="button" variant="outline"><X className="h-4 w-4" /></Button>
        </header>

        {practice ? (
          <div className="grid gap-3 overflow-y-auto p-3">
            <div className="flex flex-wrap gap-2">
              {practice.status === "PAUSED" ? (
                <Button className="min-h-9 px-3 py-1.5 text-sm" disabled={saving} onClick={() => void changeStatus("ACTIVE")} type="button"><Play className="h-4 w-4" />{t("vocabulary.live.resume")}</Button>
              ) : (
                <Button className="min-h-9 px-3 py-1.5 text-sm" disabled={saving || practice.status === "COMPLETED"} onClick={() => void changeStatus("PAUSED")} type="button" variant="outline"><Pause className="h-4 w-4" />{t("vocabulary.live.pause")}</Button>
              )}
              <Button className="min-h-9 px-3 py-1.5 text-sm" disabled={saving || practice.status === "COMPLETED"} onClick={() => setClosing(true)} type="button" variant="outline"><Square className="h-4 w-4" />{t("vocabulary.live.stop")}</Button>
            </div>
            {closing ? (
              <div className="grid gap-2 rounded-2xl border border-primary/20 bg-[#fff8f3] p-3">
                <strong className="text-sm">{t("vocabulary.live.closeTitle")}</strong>
                <p className="text-xs font-bold text-muted-foreground">{t("vocabulary.live.closeDescription")}</p>
                <Button disabled={saving} onClick={() => void closePractice(true)} type="button"><Home className="h-4 w-4" />{t("vocabulary.live.stopAndContinueHome")}</Button>
                <Button disabled={saving} onClick={() => void closePractice(false)} type="button" variant="outline"><Square className="h-4 w-4" />{t("vocabulary.live.stopOnly")}</Button>
                <Button disabled={saving} onClick={() => setClosing(false)} type="button" variant="outline">{t("common.actions.cancel")}</Button>
              </div>
            ) : null}
            {deliveryError ? <p aria-live="assertive" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-xs font-bold text-destructive">{t("vocabulary.live.deliveryRecoverable")} {deliveryError}</p> : null}
            {practice.sessions.map((session) => (
              <button
                className="rounded-2xl border border-border bg-white p-3 text-left"
                data-active={session.ownerSubject === selectedSession?.ownerSubject ? "true" : "false"}
                key={session.id}
                onClick={() => onSelectStudent(session.ownerSubject)}
                type="button"
              >
                <span className="flex items-center justify-between gap-2">
                  <strong className="truncate">{session.ownerName ?? session.ownerSubject}</strong>
                  {session.status === "COMPLETED" ? <Check className="h-4 w-4 text-[#197a45]" /> : <Users className="h-4 w-4 text-primary" />}
                </span>
                <span className="mt-2 block text-xs font-bold text-muted-foreground">
                  {t("vocabulary.live.studentProgress", {
                    accuracy: session.accuracy == null ? "—" : `${Math.round(session.accuracy * 100)}%`,
                    completed: session.completedItems,
                    total: session.totalItems,
                  })}
                </span>
                <span className="mt-2 grid grid-cols-2 gap-1 text-[11px] font-bold text-muted-foreground">
                  <span className="inline-flex items-center gap-1">{isRecentlyConnected(session.updatedAt) ? <Wifi className="h-3 w-3 text-[#197a45]" /> : <WifiOff className="h-3 w-3" />}{t(`vocabulary.live.connection.${isRecentlyConnected(session.updatedAt) ? "ONLINE" : "STALE"}`)}</span>
                  <span>{t("vocabulary.live.position", { current: Math.min(session.completedItems + 1, session.totalItems), total: session.totalItems })}</span>
                  <span>{t("vocabulary.live.activity", { count: session.attemptCount })}</span>
                  <span>{t("vocabulary.live.hints", { count: session.teacherHint ? 1 : 0 })}</span>
                </span>
                {session.helpRequested ? <span className="mt-2 inline-flex items-center gap-1 text-xs font-black text-primary"><CircleHelp className="h-3.5 w-3.5" />{t("vocabulary.live.helpRequested")}</span> : null}
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${session.totalItems ? Math.round((session.completedItems / session.totalItems) * 100) : 100}%` }} />
                </span>
              </button>
            ))}
            <Button disabled={!selectedSession || selectedSession.status === "COMPLETED" || saving} onClick={() => void hint()} type="button" variant="outline">
              {t("vocabulary.live.giveHint")}
            </Button>
            {practice.status === "COMPLETED" ? (
              <>
                {practice.sessions.some((session) => session.completedItems < session.totalItems) ? (
                  <Button disabled={saving || continuedHome} onClick={() => void continueHome()} type="button">
                    {continuedHome ? <Check className="h-4 w-4" /> : <Home className="h-4 w-4" />}
                    {continuedHome ? t("vocabulary.live.continuedHome") : t("vocabulary.live.continueHome")}
                  </Button>
                ) : null}
                <Button onClick={() => onPracticeChange(null)} type="button" variant="outline">
                  <ChevronRight className="h-4 w-4" />{t("vocabulary.live.returnToLesson")}
                </Button>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 border-b border-border p-3" role="tablist">
              <Button aria-selected={tab === "MATERIALS"} onClick={() => setTab("MATERIALS")} role="tab" type="button" variant={tab === "MATERIALS" ? "default" : "outline"}>
                {t("classroom.activityRail.materials")}
              </Button>
              <Button aria-selected={tab === "PERSONAL"} onClick={() => setTab("PERSONAL")} role="tab" type="button" variant={tab === "PERSONAL" ? "default" : "outline"}>
                {t("classroom.activityRail.personal")}
              </Button>
            </div>
            <div className="overflow-y-auto p-3">
              {tab === "MATERIALS" ? (
                <div className="grid gap-3">
                  <label className="grid gap-1 text-sm font-black">
                    {t("classroom.material.pickerLabel")}
                    <select className="playsay-input" disabled={assigningMaterial || materials.length === 0} onChange={(event) => onSelectMaterial(event.target.value)} value={selectedMaterialId}>
                      <option value="">{t("classroom.material.pickerEmpty")}</option>
                      {materials.map((material) => <option key={material.id} value={material.id}>{material.title}</option>)}
                    </select>
                  </label>
                  <Button disabled={assigningMaterial || selectedMaterialId === (currentMaterialId ?? "")} onClick={onAssignMaterial} type="button">
                    <BookOpen className="h-4 w-4" />{t("classroom.actions.assign")}
                  </Button>
                  <TeacherAddMaterialMenu
                    onUploadHtmlGamePage={onUploadHtmlGamePage}
                    onUploadImagePage={onUploadImagePage}
                    uploadingHtmlGamePage={uploadingHtmlGamePage}
                    uploadingImagePage={uploadingImagePage}
                  />
                </div>
              ) : (
                <PersonalPracticeComposer
                  actionLabel={t("vocabulary.practice.composer.startNow")}
                  delivery="LIVE"
                  lessonId={lessonId}
                  onPublish={async (preview, settings) => {
                    onPracticeChange(await createVocabularyPractice({
                      ...settings,
                      delivery: "LIVE",
                      lessonId,
                      planId: preview.planId,
                      planRevision: preview.revision,
                    }));
                  }}
                  owners={owners}
                />
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function isRecentlyConnected(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < 90_000;
}
