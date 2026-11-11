import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../../components/ui/button";
import { fetchUnallocatedParallelAnnotationSnapshots, fetchUnallocatedParallelMaterialAnnotations, isApiStatus, type LessonMaterial } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { annotationContentFromJson, type AnnotationContent } from "../model/annotation";
import { LessonTaskCanvas } from "./LessonTaskCanvas";
import { UnallocatedAnnotationFallback } from "./UnallocatedAnnotationFallback";

type ArchiveEntry = { id: string; content: AnnotationContent; source: "original" | "snapshot" };
type ArchiveState = { kind: "loading" } | { kind: "error" } |
  { kind: "ready"; original: ArchiveEntry | null; entries: ArchiveEntry[]; selected: number; page: number; hasNext: boolean };

export function UnallocatedAnnotationArchive({ lessonId, materialId, material, teacherName }: {
  lessonId: string; materialId: string; material: LessonMaterial | null; teacherName: string;
}) {
  const { t } = useAppTranslation();
  const [archive, setArchive] = useState<ArchiveState>({ kind: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoadingMore(false);
    setPageError(false);
    setArchive({ kind: "loading" });
    try {
      const [original, snapshots] = await Promise.all([
        fetchUnallocatedParallelMaterialAnnotations(lessonId, materialId),
        fetchUnallocatedParallelAnnotationSnapshots(lessonId, materialId),
      ]);
      const first: ArchiveEntry | null = original ? { id: original.id, content: annotationContentFromJson(original.content), source: "original" } : null;
      const entries: ArchiveEntry[] = snapshots.items.map((item) => ({ id: item.id, content: annotationContentFromJson(item.content), source: "snapshot" }));
      if (request === requestRef.current) setArchive({ kind: "ready", original: first, entries, selected: first ? -1 : 0, page: 0, hasNext: snapshots.hasNext });
    } catch {
      if (request === requestRef.current) setArchive({ kind: "error" });
    }
  }, [lessonId, materialId]);
  useEffect(() => { void load(); return () => { requestRef.current += 1; }; }, [load]);

  async function moveEntry(direction: -1 | 1) {
    if (archive.kind !== "ready" || loadingMore) return;
    if (direction === 1 && archive.selected < archive.entries.length - 1) {
      setArchive({ ...archive, selected: archive.selected + 1 });
      return;
    }
    if (direction === -1 && archive.selected > 0) {
      setArchive({ ...archive, selected: archive.selected - 1 });
      return;
    }
    if (direction === -1 && archive.selected === 0 && archive.page === 0 && archive.original) {
      setArchive({ ...archive, selected: -1 });
      return;
    }
    if ((direction === 1 && !archive.hasNext) || (direction === -1 && archive.page === 0)) return;
    const request = requestRef.current;
    const requestedPage = archive.page + direction;
    setLoadingMore(true);
    setPageError(false);
    try {
      const next = await fetchUnallocatedParallelAnnotationSnapshots(lessonId, materialId, requestedPage);
      if (request !== requestRef.current) return;
      setArchive((current) => {
        if (current.kind !== "ready" || current.page !== requestedPage - direction) return current;
        const entries: ArchiveEntry[] = next.items.map((item) => ({ id: item.id, content: annotationContentFromJson(item.content), source: "snapshot" }));
        const selected = direction === 1 ? 0 : entries.length ? entries.length - 1 : current.original ? -1 : 0;
        return { ...current, entries, selected, page: requestedPage, hasNext: next.hasNext };
      });
    } catch (caught) {
      if (request === requestRef.current) {
        const changedAccount = typeof caught === "object" && caught !== null && "errorCode" in caught && caught.errorCode === "SESSION_CHANGED";
        if (changedAccount || [401, 403, 404].some((status) => isApiStatus(caught, status))) setArchive({ kind: "error" });
        else setPageError(true);
      }
    } finally {
      if (request === requestRef.current) setLoadingMore(false);
    }
  }

  const entry = archive.kind === "ready" ? archive.selected === -1 ? archive.original : archive.entries[archive.selected] : undefined;
  const canPrevious = archive.kind === "ready" && archive.selected >= 0 && (archive.selected > 0 || archive.page > 0 || Boolean(archive.original));
  const canNext = archive.kind === "ready" && (archive.selected < archive.entries.length - 1 || archive.hasNext);
  const currentNumber = archive.kind === "ready" ? archive.selected === -1 ? 1 : (archive.original ? 1 : 0) + archive.page * 5 + archive.selected + 1 : 0;
  const knownCount = archive.kind === "ready" ? (archive.original ? 1 : 0) + archive.page * 5 + archive.entries.length : 0;
  return <section aria-label={t("classroom.unallocatedAnnotations.title")}>
    <div className="playsay-lesson-inline-message">
      <strong>{t("classroom.unallocatedAnnotations.title")}</strong>{" "}<span>{t("classroom.unallocatedAnnotations.description")}</span>
    </div>
    {archive.kind === "loading" ? <div role="status">{t("classroom.material.loading")}</div> : null}
    {archive.kind === "error" ? <div role="alert">{t("classroom.unallocatedAnnotations.error")}{" "}
      <Button type="button" onClick={() => void load()}>{t("classroom.collaborationRecovery.retry")}</Button>
    </div> : null}
    {archive.kind === "ready" && !archive.original && archive.entries.length === 0 ? <div role="status">{t("classroom.unallocatedAnnotations.empty")}</div> : null}
    {archive.kind === "ready" && entry ? <>
      {canPrevious || canNext ? <div className="playsay-lesson-inline-message flex flex-wrap items-center gap-2" role="group" aria-label={t("classroom.unallocatedAnnotations.snapshotNavigation")}>
        <Button className="min-h-11" disabled={!canPrevious || loadingMore} type="button" variant="outline" onClick={() => void moveEntry(-1)}>{t("classroom.unallocatedAnnotations.previous")}</Button>
        <span role="status">{t(entry.source === "original" ? "classroom.unallocatedAnnotations.original" : "classroom.unallocatedAnnotations.snapshot")} · {currentNumber}/{knownCount}{archive.hasNext ? "+" : ""}</span>
        <Button className="min-h-11" disabled={!canNext || loadingMore} type="button" variant="outline" onClick={() => void moveEntry(1)}>{t("classroom.unallocatedAnnotations.next")}</Button>
      </div> : null}
      {loadingMore ? <div role="status">{t("classroom.material.loading")}</div> : null}
      {pageError ? <div role="alert">{t("classroom.unallocatedAnnotations.error")}</div> : null}
      {material ? <LessonTaskCanvas key={entry.id} canControlPages lessonId={lessonId} material={material} onSaveAnswers={() => undefined}
        readOnlyAnnotation={entry.content} score={null} submission={null} submissionMessage={null} submissionSaving={false} teacherName={teacherName} />
        : <UnallocatedAnnotationFallback key={entry.id} content={entry.content} />}
    </> : null}
  </section>;
}
