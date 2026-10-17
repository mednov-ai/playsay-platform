import { useAppTranslation } from "../../../shared/i18n";
import type { MaterialCategory } from "../model/materialCategory";

export function MaterialCategoryFilter({ value, onChange, disabled = false }: {
  value: MaterialCategory;
  onChange: (value: MaterialCategory) => void;
  disabled?: boolean;
}) {
  const { t } = useAppTranslation();
  return <div className="playsay-material-category-filter" role="group" aria-label={t("lessonMaterials.category")}>
    {(["study", "lesson", "all"] as const).map(category => <button
      key={category} type="button" aria-pressed={value === category} disabled={disabled}
      onClick={() => onChange(category)}
    >{t(`lessonMaterials.${category}`)}</button>)}
  </div>;
}
