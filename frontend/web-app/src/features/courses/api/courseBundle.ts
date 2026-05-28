import type { CourseLessonMap } from "../../../entities/schedule/model";
import { fetchCourseLessons, fetchCourses, type Course } from "../../../shared/api/playsay";

export async function fetchCourseBundle(): Promise<{ courses: Course[]; lessons: CourseLessonMap }> {
  const courses = await fetchCourses();
  const lessonEntries = await Promise.all(
    courses.map(async (course) => [course.id, await fetchCourseLessons(course.id)] as const),
  );

  return {
    courses,
    lessons: Object.fromEntries(lessonEntries),
  };
}
