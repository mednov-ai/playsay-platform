import type { CourseLessonMap } from "../../../entities/schedule/model";
import {
  fetchCourseLessons,
  fetchCourses,
  fetchCurriculumTopics,
  type Course,
  type CurriculumTopic,
} from "../../../shared/api/playsay";

export type CourseBundle = {
  courses: Course[];
  lessons: CourseLessonMap;
  topics: Record<string, CurriculumTopic[]>;
};

export async function fetchCourseBundle(): Promise<CourseBundle> {
  const courses = await fetchCourses();
  const entries = await Promise.all(
    courses.map(async (course) => {
      const [courseLessons, courseTopics] = await Promise.all([
        fetchCourseLessons(course.id),
        fetchCurriculumTopics(course.id),
      ]);
      return [course.id, courseLessons, courseTopics] as const;
    }),
  );

  return {
    courses,
    lessons: Object.fromEntries(entries.map(([courseId, courseLessons]) => [courseId, courseLessons])),
    topics: Object.fromEntries(entries.map(([courseId, , courseTopics]) => [courseId, courseTopics])),
  };
}
