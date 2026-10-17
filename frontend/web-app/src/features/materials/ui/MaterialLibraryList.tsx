import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Globe2, LockKeyhole, Plus } from "lucide-react";
import type { LessonMaterial } from "../../../shared/api/playsay";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import { matchesMaterialCategory, isLessonMaterial, type MaterialCategory } from "../model/materialCategory";
import { MaterialCategoryFilter } from "./MaterialCategoryFilter";
import { fetchWhiteboardLibrary, type WhiteboardLibraryItem } from "../../../shared/api/whiteboard";
const SavedWhiteboardDialog = lazy(() => import("../../classroom/ui/SavedWhiteboardDialog").then(module => ({ default: module.SavedWhiteboardDialog })));
import {
  emptyCardLibraryFilters,
  materialMatchesCardFilters,
  type CardLibraryFilters,
} from "../../courses/model/curriculumBoard";

export function MaterialLibraryList({
  activeMaterialId,
  disabled,
  materials,
  onCreateNew,
  onSelectMaterial,
}: {
  activeMaterialId: string | null;
  disabled: boolean;
  materials: LessonMaterial[];
  onCreateNew: () => void;
  onSelectMaterial: (material: LessonMaterial) => void;
}) {
  const { t, i18n } = useAppTranslation();
  const [filters, setFilters] = useState<CardLibraryFilters>(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem("honey-material-filters-v1") ?? "null");
      return stored && ["ageBand", "level", "skillTag", "topicTag"].every(key => typeof stored[key] === "string") && (stored.maxDurationMin === null || typeof stored.maxDurationMin === "number") ? stored : emptyCardLibraryFilters;
    } catch { return emptyCardLibraryFilters; }
  });
  const [category, setCategory] = useState<MaterialCategory>(() => {
    try { const value = sessionStorage.getItem("honey-material-category-v1"); return value === "lesson" || value === "all" ? value : "study"; }
    catch { return "study"; }
  });
  const [query, setQuery] = useState(() => { try { return sessionStorage.getItem("honey-material-query-v1") ?? ""; } catch { return ""; } });
  useEffect(() => { try { sessionStorage.setItem("honey-material-query-v1", query); } catch { /* Optional preference. */ } }, [query]);
  const filteredMaterials = useMemo(
    () => materials.filter((material) => matchesMaterialCategory(material, category) && materialMatchesCardFilters(material, filters) && (!query.trim() || material.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))),
    [category, filters, materials, query],
  );
  const [boards, setBoards] = useState<WhiteboardLibraryItem[]>([]);
  const [openedBoard, setOpenedBoard] = useState<WhiteboardLibraryItem | null>(null);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [boardsFailed, setBoardsFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    try { sessionStorage.setItem("honey-material-filters-v1", JSON.stringify(filters)); } catch { /* Optional session preference. */ }
  }, [filters]);
  useEffect(() => {
    if (category === "study") return;
    let disposed = false; setBoardsLoading(true); setBoardsFailed(false);
    void fetchWhiteboardLibrary().then(value => { if (!disposed) setBoards(value); }).catch(() => { if (!disposed) setBoardsFailed(true); })
      .finally(() => { if (!disposed) setBoardsLoading(false); });
    return () => { disposed = true; };
  }, [attempt, category]);
  const filteredBoards = category === "study" || filters.level || filters.ageBand || filters.skillTag || filters.topicTag || filters.maxDurationMin !== null ? [] : boards.filter(board => !query.trim() || `${t("whiteboard.title")} ${board.title ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  const entries = [
    ...filteredBoards.map(board => ({ kind: "BOARD" as const, board, updatedAt: board.updatedAt })),
    ...filteredMaterials.map(material => ({ kind: "MATERIAL" as const, material, updatedAt: material.updatedAt })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function updateFilter<Key extends keyof CardLibraryFilters>(field: Key, value: CardLibraryFilters[Key]) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/45 p-3">
      {openedBoard ? <Suspense fallback={<span role="status">{t("whiteboard.status.connecting")}</span>}><SavedWhiteboardDialog lessonId={openedBoard.lessonId} boardId={openedBoard.id} onClose={() => setOpenedBoard(null)}/></Suspense> : null}
      <label className="mb-3 grid gap-1 text-sm">{t("lessonMaterials.search")}<input className="playsay-input" type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)}/></label>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold">{t("materials.library.title")}</div>
        <Button disabled={disabled} onClick={onCreateNew} type="button" variant="outline">
          <Plus className="h-4 w-4" />
          {t("materials.library.new")}
        </Button>
      </div>
      <MaterialCategoryFilter value={category} disabled={disabled} onChange={value => {
        setCategory(value);
        try { sessionStorage.setItem("honey-material-category-v1", value); } catch { /* Session preferences are optional. */ }
      }} />
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <input
          className="playsay-input"
          disabled={disabled}
          onChange={(event) => updateFilter("level", event.target.value)}
          placeholder={t("materials.filters.level")}
          value={filters.level}
        />
        <input
          className="playsay-input"
          disabled={disabled}
          onChange={(event) => updateFilter("topicTag", event.target.value)}
          placeholder={t("materials.filters.topic")}
          value={filters.topicTag}
        />
        <input
          className="playsay-input"
          disabled={disabled}
          onChange={(event) => updateFilter("skillTag", event.target.value)}
          placeholder={t("materials.filters.skill")}
          value={filters.skillTag}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            className="playsay-input"
            disabled={disabled}
            onChange={(event) => updateFilter("ageBand", event.target.value)}
            placeholder={t("materials.filters.age")}
            value={filters.ageBand}
          />
          <input
            className="playsay-input"
            disabled={disabled}
            min={1}
            onChange={(event) => updateFilter("maxDurationMin", numberFilterValue(event.target.value))}
            placeholder={t("materials.filters.duration")}
            type="number"
            value={filters.maxDurationMin ?? ""}
          />
        </div>
      </div>
      {boardsLoading ? <p role="status">{t("whiteboard.status.connecting")}</p> : null}
      {boardsFailed ? <p role="alert">{t("whiteboard.failed")} <button type="button" onClick={() => setAttempt(v => v + 1)}>{t("whiteboard.retry")}</button></p> : null}
      {materials.length === 0 && !filteredBoards.length && !boardsLoading && !boardsFailed ? (
        <div className="rounded-xl border border-border bg-background p-3 text-sm font-semibold text-muted-foreground">
          {t("materials.library.empty")}
        </div>
      ) : filteredMaterials.length === 0 && !filteredBoards.length && !boardsLoading && !boardsFailed ? (
        <div className="rounded-xl border border-border bg-background p-3 text-sm font-semibold text-muted-foreground">
          {t("materials.library.noFiltered")}
        </div>
      ) : (
        <div className="grid max-h-[30rem] gap-2 overflow-auto pr-1">
          {entries.map(entry => {
            if (entry.kind === "BOARD") { const board = entry.board; return <button key={board.id} type="button" className="playsay-material-list-item" disabled={disabled} onClick={() => setOpenedBoard(board)}>
          <span><span className="block font-bold">{t("whiteboard.title")}{board.title ? ` · ${board.title}` : ""}</span>
            <span className="block text-xs text-muted-foreground">{t("lessonMaterials.mark")} · {new Date(board.createdAt).toLocaleDateString(i18n.language)}</span></span>
        </button>; }
            const material = entry.material;
            return (
            <button
              className="playsay-material-list-item"
              data-active={activeMaterialId === material.id ? "true" : "false"}
              disabled={disabled}
              key={material.id}
              onClick={() => onSelectMaterial(material)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold">{material.title}</span>
                <span className="mt-1 flex flex-wrap gap-1.5 text-[0.68rem] font-black uppercase text-muted-foreground">
                  {isLessonMaterial(material) ? <span>{t("lessonMaterials.mark")}</span> : null}
                  <span>{material.cefrLevel}</span>
                  <span>{material.status}</span>
                  <span>{material.visibility}</span>
                  <span>{t("materials.library.blocks", { count: material.blockCount })}</span>
                  {material.estimatedDurationMin ? (
                    <span>{t("materials.library.duration", { count: material.estimatedDurationMin })}</span>
                  ) : null}
                </span>
                {[...(material.topicTags ?? []), ...(material.skillTags ?? [])].length > 0 ? (
                  <span className="mt-2 flex flex-wrap gap-1">
                    {[...(material.topicTags ?? []), ...(material.skillTags ?? [])].slice(0, 4).map((tag, index) => (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[0.64rem] font-black text-muted-foreground" key={`${tag}-${index}`}>
                        {tag}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
              {material.visibility === "PUBLIC" ? (
                <Globe2 className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function numberFilterValue(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
