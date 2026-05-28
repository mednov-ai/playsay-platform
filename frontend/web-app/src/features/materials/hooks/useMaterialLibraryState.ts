import { useEffect, useState } from "react";
import type { CourseLessonMap } from "../../../entities/schedule/model";
import type { Course } from "../../../shared/api/playsay";
import { flattenCourseLessonMaterialOptions } from "../model/materialDocument";

export function useMaterialLibraryState({
  courses,
  lessons,
}: {
  courses: Course[];
  lessons: CourseLessonMap;
}) {
  const lessonOptions = flattenCourseLessonMaterialOptions(courses, lessons);
  const [selectedLessonKey, setSelectedLessonKey] = useState("");

  useEffect(() => {
    if (selectedLessonKey || lessonOptions.length === 0) {
      return;
    }
    setSelectedLessonKey(lessonOptions[0].key);
  }, [lessonOptions, selectedLessonKey]);

  return {
    lessonOptions,
    selectedLessonKey,
    setSelectedLessonKey,
  };
}
