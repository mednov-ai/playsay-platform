import { Globe2, LockKeyhole, Plus } from "lucide-react";
import type { LessonMaterial } from "../../../shared/api/playsay";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";

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

  return (
    <div className="rounded-2xl border border-border bg-muted/45 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold">{t("materials.library.title")}</div>
        <Button disabled={disabled} onClick={onCreateNew} type="button" variant="outline">
          <Plus className="h-4 w-4" />
          {t("materials.library.new")}
        </Button>
      </div>
      {materials.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-3 text-sm font-semibold text-muted-foreground">
          {t("materials.library.empty")}
        </div>
      ) : (
        <div className="grid max-h-[30rem] gap-2 overflow-auto pr-1">
          {materials.map((material) => (
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
                </span>
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
