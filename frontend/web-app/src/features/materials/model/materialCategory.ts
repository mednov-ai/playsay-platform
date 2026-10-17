import type { LessonMaterial } from "../../../shared/api/types";

export type MaterialCategory = "study" | "lesson" | "all";
export function isLessonMaterial(material: Pick<LessonMaterial, "isLessonMaterial" | "sourceMeta">): boolean {
  return material.isLessonMaterial ?? material.sourceMeta?.kind === "LIVE_LESSON_COPY";
}
export function matchesMaterialCategory(material: Pick<LessonMaterial, "isLessonMaterial" | "sourceMeta">, category: MaterialCategory): boolean {
  return category === "all" || isLessonMaterial(material) === (category === "lesson");
}
