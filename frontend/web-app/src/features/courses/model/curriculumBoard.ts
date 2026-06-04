import type { CourseLessonMap } from "../../../entities/schedule/model";
import type { Course, CourseLesson, CurriculumTopic, LessonMaterial } from "../../../shared/api/playsay";

export { courseLessonDefaultMaterialId } from "../../../entities/schedule/model";

export type CurriculumTopicCard = {
  cardCount: number;
  lessonCount: number;
  lessons: CourseLesson[];
  previewLessons: CourseLesson[];
  topic: CurriculumTopic;
};

export type CurriculumLevelTrack = {
  course: Course;
  levelLabel: string;
  topics: CurriculumTopicCard[];
  untitledLessons: CourseLesson[];
};

export type CurriculumBoardInput = {
  courses: Course[];
  lessons: CourseLessonMap;
  topics: Record<string, CurriculumTopic[]>;
};

export type CardLibraryFilters = {
  ageBand: string;
  level: string;
  maxDurationMin: number | null;
  skillTag: string;
  topicTag: string;
};

export const emptyCardLibraryFilters: CardLibraryFilters = {
  ageBand: "",
  level: "",
  maxDurationMin: null,
  skillTag: "",
  topicTag: "",
};

export function buildCurriculumBoard({ courses, lessons, topics }: CurriculumBoardInput): CurriculumLevelTrack[] {
  return [...courses]
    .sort(compareCourses)
    .map((course) => {
      const courseLessons = [...(lessons[course.id] ?? [])].sort(compareLessons);
      const lessonsByTopic = courseLessons.reduce<Record<string, CourseLesson[]>>((result, lesson) => {
        const topicId = lesson.topicId ?? "";
        if (!topicId) {
          return result;
        }
        return {
          ...result,
          [topicId]: [...(result[topicId] ?? []), lesson],
        };
      }, {});
      return {
        course,
        levelLabel: course.level?.trim() || course.title,
        topics: [...(topics[course.id] ?? [])].sort(compareTopics).map((topic) => {
          const topicLessons = lessonsByTopic[topic.id] ?? [];
          return {
            cardCount: topicLessons.reduce((count, lesson) => count + (lesson.cards?.length ?? 0), 0),
            lessonCount: topicLessons.length,
            lessons: topicLessons,
            previewLessons: topicLessons.slice(0, 3),
            topic,
          };
        }),
        untitledLessons: courseLessons.filter((lesson) => !lesson.topicId),
      };
    });
}

export function materialMatchesCardFilters(material: LessonMaterial, filters: CardLibraryFilters): boolean {
  const level = filters.level.trim().toLowerCase();
  if (level && material.cefrLevel.toLowerCase() !== level) {
    return false;
  }
  if (!matchesAny(material.topicTags ?? [], filters.topicTag)) {
    return false;
  }
  if (!matchesAny(material.skillTags ?? [], filters.skillTag)) {
    return false;
  }
  const age = filters.ageBand.trim().toLowerCase();
  if (age && !(material.ageBand ?? "").toLowerCase().includes(age)) {
    return false;
  }
  if (filters.maxDurationMin !== null && (material.estimatedDurationMin ?? Number.MAX_SAFE_INTEGER) > filters.maxDurationMin) {
    return false;
  }
  return true;
}

function matchesAny(values: string[], filter: string): boolean {
  const normalized = filter.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return values.some((value) => value.toLowerCase().includes(normalized));
}

function compareCourses(left: Course, right: Course): number {
  return (left.level ?? left.title).localeCompare(right.level ?? right.title) || left.title.localeCompare(right.title);
}

function compareTopics(left: CurriculumTopic, right: CurriculumTopic): number {
  const leftOrder = left.orderIndex ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.orderIndex ?? Number.MAX_SAFE_INTEGER;
  return leftOrder - rightOrder || left.createdAt.localeCompare(right.createdAt) || left.title.localeCompare(right.title);
}

function compareLessons(left: CourseLesson, right: CourseLesson): number {
  const leftOrder = left.orderIndex ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.orderIndex ?? Number.MAX_SAFE_INTEGER;
  return leftOrder - rightOrder || left.createdAt.localeCompare(right.createdAt) || left.title.localeCompare(right.title);
}
