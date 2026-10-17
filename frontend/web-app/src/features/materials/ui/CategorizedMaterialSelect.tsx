import { useState, type SelectHTMLAttributes } from "react";
import type { LessonMaterial } from "../../../shared/api/types";
import { useAppTranslation } from "../../../shared/i18n";
import { isLessonMaterial } from "../model/materialCategory";

/** Keep the selected material resolvable even when lesson results are hidden. */
export function CategorizedMaterialSelect({ materials, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { materials: LessonMaterial[] }) {
  const { t } = useAppTranslation();
  const [includeLesson, setIncludeLesson] = useState(false);
  const selected = new Set(Array.isArray(props.value) ? props.value.map(String) : [String(props.value ?? "")]);
  return <span className="grid min-w-0 flex-[3_1_12rem] gap-1">
    <select {...props}>
      {children}
      {materials.filter(material => includeLesson || !isLessonMaterial(material) || selected.has(material.id)).map(material => <option key={material.id} value={material.id}>{material.title}{isLessonMaterial(material) ? ` · ${t("lessonMaterials.mark")}` : ""}</option>)}
    </select>
    <span role="switch" aria-checked={includeLesson} tabIndex={0} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-normal" onClick={event => { event.preventDefault(); event.stopPropagation(); setIncludeLesson(value => !value); }} onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); event.stopPropagation(); setIncludeLesson(value => !value); } }}>
      <span aria-hidden="true">{includeLesson ? "☑" : "☐"}</span>{t("lessonMaterials.include")}
    </span>
  </span>;
}
