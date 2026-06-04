import { useMemo, useState } from "react";
import { Globe2, LockKeyhole, Plus } from "lucide-react";
import type { LessonMaterial } from "../../../shared/api/playsay";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
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
  const { t } = useAppTranslation();
  const [filters, setFilters] = useState<CardLibraryFilters>(emptyCardLibraryFilters);
  const filteredMaterials = useMemo(
    () => materials.filter((material) => materialMatchesCardFilters(material, filters)),
    [filters, materials],
  );

  function updateFilter<Key extends keyof CardLibraryFilters>(field: Key, value: CardLibraryFilters[Key]) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/45 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold">{t("materials.library.title")}</div>
        <Button disabled={disabled} onClick={onCreateNew} type="button" variant="outline">
          <Plus className="h-4 w-4" />
          {t("materials.library.new")}
        </Button>
      </div>
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
      {materials.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-3 text-sm font-semibold text-muted-foreground">
          {t("materials.library.empty")}
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-3 text-sm font-semibold text-muted-foreground">
          {t("materials.library.noFiltered")}
        </div>
      ) : (
        <div className="grid max-h-[30rem] gap-2 overflow-auto pr-1">
          {filteredMaterials.map((material) => (
            <button
              className="playsay-material-list-item"
              data-active={activeMaterialId === material.id ? "true" : "false"}
              key={material.id}
              onClick={() => onSelectMaterial(material)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold">{material.title}</span>
                <span className="mt-1 flex flex-wrap gap-1.5 text-[0.68rem] font-black uppercase text-muted-foreground">
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
          ))}
        </div>
      )}
    </div>
  );
}

function numberFilterValue(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
