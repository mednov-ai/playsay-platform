import { clampNumber, type MaterialImageGenerationProgress } from "../model/materialDocument";
import { useAppTranslation } from "../../../shared/i18n";

export function MaterialImageProgress({ value }: { value: MaterialImageGenerationProgress }) {
  const { t } = useAppTranslation();
  const ratio = value.current ? value.current / Math.max(1, value.total) : 1;
  const progressText = value.current
    ? t("materials.progress.currentOfTotal", { current: value.current, total: value.total })
    : t("materials.progress.imageCount", { count: value.total });

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-[#fff7f1] px-3 py-2">
      <div className="flex items-center justify-between gap-3 text-xs font-extrabold text-primary">
        <span>{value.label}</span>
        <span>{progressText}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${Math.round(clampNumber(ratio, 0.08, 1) * 100)}%` }}
        />
      </div>
    </div>
  );
}
