import { describe, expect, it } from "vitest";
import {
  buildCurriculumBoard,
  courseLessonDefaultMaterialId,
  materialMatchesCardFilters,
  type CardLibraryFilters,
} from "./curriculumBoard";
import type { Course, CourseLesson, CurriculumTopic, LessonMaterial } from "../../../shared/api/playsay";

describe("curriculum board helpers", () => {
  it("groups level tracks with topic lesson previews and card counts", () => {
    const course = courseFixture({ id: "course-a2", level: "A2", title: "A2 track" });
    const topic = topicFixture({ id: "topic-travel", courseId: course.id, title: "Travelling" });
    const lessons = {
      [course.id]: [
        lessonFixture({ id: "lesson-1", orderIndex: 1, topicId: topic.id, title: "Airport words", cardMaterialIds: ["warmup", "practice"] }),
        lessonFixture({ id: "lesson-2", orderIndex: 2, topicId: topic.id, title: "Hotel check-in", cardMaterialIds: ["video"] }),
        lessonFixture({ id: "lesson-3", orderIndex: 3, topicId: topic.id, title: "Ask for directions", cardMaterialIds: ["speaking"] }),
        lessonFixture({ id: "lesson-4", orderIndex: 4, topicId: topic.id, title: "Travel review", cardMaterialIds: ["review"] }),
      ],
    };

    const board = buildCurriculumBoard({
      courses: [course],
      lessons,
      topics: { [course.id]: [topic] },
    });

    expect(board).toHaveLength(1);
    expect(board[0].levelLabel).toBe("A2");
    expect(board[0].topics[0].lessonCount).toBe(4);
    expect(board[0].topics[0].cardCount).toBe(5);
    expect(board[0].topics[0].previewLessons.map((lesson) => lesson.title)).toEqual([
      "Airport words",
      "Hotel check-in",
      "Ask for directions",
    ]);
  });

  it("uses the first non-homework lesson card as schedule default material", () => {
    const lesson = lessonFixture({
      id: "lesson-1",
      topicId: "topic",
      title: "Airport",
      materialId: "legacy",
      cardMaterialIds: ["homework", "practice", "speaking"],
      roles: ["HOMEWORK", "PRACTICE", "SPEAKING"],
    });

    expect(courseLessonDefaultMaterialId(lesson)).toBe("practice");
  });

  it("filters cards by level, topic, skill, age and duration", () => {
    const material = materialFixture({
      cefrLevel: "A2",
      topicTags: ["travelling", "airport"],
      skillTags: ["vocabulary"],
      ageBand: "10-12",
      estimatedDurationMin: 7,
    });
    const filters: CardLibraryFilters = {
      ageBand: "10",
      level: "A2",
      maxDurationMin: 10,
      skillTag: "vocab",
      topicTag: "airport",
    };

    expect(materialMatchesCardFilters(material, filters)).toBe(true);
    expect(materialMatchesCardFilters(material, { ...filters, maxDurationMin: 5 })).toBe(false);
    expect(materialMatchesCardFilters(material, { ...filters, topicTag: "food" })).toBe(false);
  });
});

function courseFixture(overrides: Partial<Course>): Course {
  return {
    createdAt: "2026-06-04T00:00:00Z",
    createdByUserId: null,
    description: null,
    id: "course",
    isPublished: true,
    language: "en",
    lessonCount: 0,
    level: "A1",
    title: "Course",
    updatedAt: "2026-06-04T00:00:00Z",
    ...overrides,
  };
}

function topicFixture(overrides: Partial<CurriculumTopic>): CurriculumTopic {
  return {
    courseId: "course",
    createdAt: "2026-06-04T00:00:00Z",
    description: null,
    id: "topic",
    orderIndex: 1,
    tagSlugs: [],
    title: "Topic",
    updatedAt: "2026-06-04T00:00:00Z",
    ...overrides,
  };
}

function lessonFixture({
  cardMaterialIds,
  roles = cardMaterialIds.map(() => "MAIN"),
  ...overrides
}: Partial<CourseLesson> & { cardMaterialIds: string[]; roles?: string[] }): CourseLesson {
  return {
    cards: cardMaterialIds.map((materialId, index) => ({
      createdAt: "2026-06-04T00:00:00Z",
      id: `card-${materialId}`,
      lessonTemplateId: overrides.id ?? "lesson",
      materialId,
      materialTitle: materialId,
      orderIndex: index + 1,
      plannedDurationMin: 5,
      role: roles[index],
      updatedAt: "2026-06-04T00:00:00Z",
    })),
    courseId: "course",
    createdAt: "2026-06-04T00:00:00Z",
    id: "lesson",
    materialId: cardMaterialIds[0] ?? null,
    materialTitle: cardMaterialIds[0] ?? null,
    orderIndex: 1,
    plannedDurationMin: 45,
    title: "Lesson",
    topicId: null,
    topicTitle: null,
    updatedAt: "2026-06-04T00:00:00Z",
    ...overrides,
  };
}

function materialFixture(overrides: Partial<LessonMaterial>): LessonMaterial {
  return {
    blockCount: 1,
    cefrLevel: "A1",
    createdAt: "2026-06-04T00:00:00Z",
    description: null,
    document: {},
    estimatedDurationMin: null,
    id: "material",
    language: "en",
    ownerTeacherName: null,
    ownerTeacherSubject: null,
    ownerTeacherUserId: null,
    scoringRubric: {},
    skillTags: [],
    sourceMeta: {},
    status: "PUBLISHED",
    title: "Material",
    topicTags: [],
    updatedAt: "2026-06-04T00:00:00Z",
    visibility: "PRIVATE",
    ...overrides,
  };
}
