import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { fetchMaterial, fetchUnallocatedAnnotationMaterials, isApiStatus, type LessonMaterial } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

const UnallocatedAnnotationArchive = lazy(() => import("../../classroom/ui/UnallocatedAnnotationArchive")
  .then((module) => ({ default: module.UnallocatedAnnotationArchive })));

export function UnallocatedAnnotationsHistory({ lessonId, materials, teacherName }: {
  lessonId: string; materials: LessonMaterial[]; teacherName: string;
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<{ materialIds: string[]; hasNext: boolean } | null>(null);
  const [listError, setListError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [materialState, setMaterialState] = useState<{ id: string; kind: "loading" } | { id: string; kind: "error" } | { id: string; kind: "ready"; material: LessonMaterial | null }>({ id: "", kind: "loading" });
  const currentMaterial = materialState.id === selected ? materialState : { kind: "loading" as const };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setList(null); setListError(false);
    void fetchUnallocatedAnnotationMaterials(lessonId, page).then((value) => { if (!cancelled) setList(value); })
      .catch(() => { if (!cancelled) setListError(true); });
    return () => { cancelled = true; };
  }, [attempt, lessonId, open, page]);

  useEffect(() => {
    if (!open || !selected) return;
    let cancelled = false;
    setMaterialState({ id: selected, kind: "loading" });
    void fetchMaterial(selected).then((material) => { if (!cancelled) setMaterialState({ id: selected, kind: "ready", material }); })
      .catch((error: unknown) => {
        if (!cancelled) setMaterialState(isApiStatus(error, 403) || isApiStatus(error, 404) ? { id: selected, kind: "ready", material: null } : { id: selected, kind: "error" });
      });
    return () => { cancelled = true; };
  }, [attempt, open, selected]);

  return <details className="mt-3 w-full" onToggle={(event) => {
    const next = event.currentTarget.open;
    setOpen(next);
    if (!next) { setSelected(null); setPage(0); }
  }}>
    <summary className="min-h-11 cursor-pointer rounded border px-3 py-2 font-bold">{t("classroom.unallocatedAnnotations.open")}</summary>
    <div className="grid gap-3 py-3">
      {listError ? <div role="alert">{t("classroom.unallocatedAnnotations.error")}{" "}<Button type="button" variant="outline" className="min-h-11" onClick={() => setAttempt((value) => value + 1)}>{t("classroom.collaborationRecovery.retry")}</Button></div> : null}
      {!list && !listError ? <div role="status">{t("classroom.material.loading")}</div> : null}
      {list?.materialIds.length === 0 ? <p>{t("classroom.unallocatedAnnotations.empty")}</p> : null}
      {list?.materialIds.map((id, index) => <Button key={id} type="button" variant="outline" className="h-auto min-h-11 justify-start whitespace-normal text-left"
        aria-pressed={selected === id} onClick={() => setSelected(id)}>{materials.find((material) => material.id === id)?.title || t("classroom.unallocatedAnnotations.materialNumber", { number: page * 10 + index + 1 })}</Button>)}
      {list && (page > 0 || list.hasNext) ? <nav className="flex flex-wrap gap-2" aria-label={t("classroom.unallocatedAnnotations.snapshotNavigation")}>
        <Button type="button" variant="outline" className="min-h-11" disabled={page === 0} onClick={() => { setSelected(null); setPage((value) => value - 1); }}>{t("classroom.unallocatedAnnotations.previous")}</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={!list.hasNext} onClick={() => { setSelected(null); setPage((value) => value + 1); }}>{t("classroom.unallocatedAnnotations.next")}</Button>
      </nav> : null}
      {selected && currentMaterial.kind === "loading" ? <div role="status">{t("classroom.material.loading")}</div> : null}
      {selected && currentMaterial.kind === "error" ? <div role="alert">{t("classroom.unallocatedAnnotations.error")}{" "}<Button type="button" variant="outline" className="min-h-11" onClick={() => setAttempt((value) => value + 1)}>{t("classroom.collaborationRecovery.retry")}</Button></div> : null}
      {selected && currentMaterial.kind === "ready" ? <Suspense fallback={<div role="status">{t("classroom.material.loading")}</div>}>
        <UnallocatedAnnotationArchive key={selected} lessonId={lessonId} materialId={selected} material={currentMaterial.material} teacherName={teacherName} />
      </Suspense> : null}
    </div>
  </details>;
}
