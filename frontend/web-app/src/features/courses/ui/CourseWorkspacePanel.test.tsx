import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type {
  Course,
  CourseLesson,
  CurriculumTopic,
  LessonMaterial,
  MeProfile,
} from "../../../shared/api/playsay";
import { CourseWorkspacePanel } from "./CourseWorkspacePanel";

describe("CourseWorkspacePanel responsive layout", () => {
  it("keeps teacher lesson controls wrapping inside the topic inspector", () => {
    const markup = renderPanel(teacherProfile);

    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("overscroll-x-contain");
    expect(markup).toContain("flex-[1_1_5rem]");
    expect(markup).toContain("flex-[3_1_12rem]");
    expect(markup).toContain("whitespace-normal");
    expect(markup).not.toContain("truncate");
    expect(markup).not.toContain("sm:grid-cols-[5rem_6rem_1fr]");
    expect(markup).not.toContain("sm:grid-cols-[minmax(0,1fr)_8rem_5rem_auto]");
    expect(markup).toContain("very-long-topic-tag-without-natural-breaks");
  });

  it("keeps the level scroller but hides management forms for students", () => {
    const markup = renderPanel(studentProfile);

    expect(markup).toContain("overflow-x-auto");
    expect(markup).toContain("Starter Adventures");
    expect(markup).not.toContain("Создать уровень");
    expect(markup).not.toContain("Добавить урок");
    expect(markup).not.toContain("Добавить карточку");
  });
});

function renderPanel(profile: MeProfile): string {
  return renderToStaticMarkup(
    <AppProviders>
      <CourseWorkspacePanel
        courses={[course]}
        disabled={false}
        lessons={{ [course.id]: [lesson] }}
        loading={false}
        materials={[material]}
        message={null}
        onCreateCourse={() => undefined}
        onCreateLesson={() => undefined}
        onCreateTopic={() => undefined}
        onDeleteCourse={() => undefined}
        onDeleteLesson={() => undefined}
        onDeleteTopic={() => undefined}
        onRefresh={() => undefined}
        onReplaceLessonCards={() => undefined}
        onUpdateTopic={() => undefined}
        profile={profile}
        topics={{ [course.id]: [topic] }}
      />
    </AppProviders>,
  );
}

const teacherProfile = {
  roles: ["TEACHER"],
  subject: "teacher-demo",
  username: "teacher-demo",
} as MeProfile;

const studentProfile = {
  roles: ["STUDENT"],
  subject: "student-demo",
  username: "student-demo",
} as MeProfile;

const course = {
  createdAt: "2026-07-13T00:00:00Z",
  createdByUserId: null,
  description: "A long level description that must stay inside the level card.",
  id: "course-a1",
  isPublished: true,
  language: "en",
  lessonCount: 1,
  level: "A1",
  title: "Starter Adventures",
  updatedAt: "2026-07-13T00:00:00Z",
} as Course;

const topic = {
  courseId: course.id,
  createdAt: "2026-07-13T00:00:00Z",
  description: "A topic description with enough content to exercise wrapping.",
  id: "topic-family",
  orderIndex: 1,
  tagSlugs: ["very-long-topic-tag-without-natural-breaks"],
  title: "Family and introductions",
  updatedAt: "2026-07-13T00:00:00Z",
} as CurriculumTopic;

const lesson = {
  cards: [{
    createdAt: "2026-07-13T00:00:00Z",
    id: "card-main",
    lessonTemplateId: "lesson-family",
    materialId: "material-family",
    materialTitle: "Introductions practice material with a long title",
    orderIndex: 1,
    plannedDurationMin: 15,
    role: "MAIN",
    updatedAt: "2026-07-13T00:00:00Z",
  }],
  courseId: course.id,
  createdAt: "2026-07-13T00:00:00Z",
  id: "lesson-family",
  materialId: "material-family",
  materialTitle: "Introductions practice material with a long title",
  orderIndex: 1,
  plannedDurationMin: 45,
  title: "Meeting a new friend and introducing your family",
  topicId: topic.id,
  topicTitle: topic.title,
  updatedAt: "2026-07-13T00:00:00Z",
} as CourseLesson;

const material = {
  blockCount: 1,
  cefrLevel: "A1",
  createdAt: "2026-07-13T00:00:00Z",
  description: null,
  document: {},
  estimatedDurationMin: 15,
  id: "material-family",
  language: "en",
  scoringRubric: {},
  sourceMeta: {},
  status: "PUBLISHED",
  title: "Introductions practice material with a long title",
  topicTags: ["family"],
  skillTags: ["speaking"],
  updatedAt: "2026-07-13T00:00:00Z",
  visibility: "PRIVATE",
} as LessonMaterial;
