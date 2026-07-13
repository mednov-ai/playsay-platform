// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import type {
  Course,
  CourseLesson,
  CurriculumTopic,
  CurriculumTopicInput,
  LessonMaterial,
  MeProfile,
} from "../../../shared/api/playsay";
import { CourseWorkspacePanel } from "./CourseWorkspacePanel";
import { i18n } from "../../../shared/i18n";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

afterEach(cleanup);
beforeAll(async () => {
  await i18n.changeLanguage("ru");
});

describe("CourseWorkspacePanel contextual program flow", () => {
  it("starts with the full-width board and opens or closes the inspector explicitly", async () => {
    renderPanel(teacherProfile);

    const board = screen.getByTestId("curriculum-board");
    const topicButton = screen.getByRole("button", { name: "Открыть тему «Family and introductions»" });
    expect(board).toHaveAttribute("data-inspector-open", "false");
    expect(screen.queryByTestId("curriculum-topic-inspector")).not.toBeInTheDocument();

    fireEvent.click(topicButton);

    expect(board).toHaveAttribute("data-inspector-open", "true");
    expect(screen.getByTestId("curriculum-topic-inspector")).toBeInTheDocument();
    expect(topicButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("very-long-topic-tag-without-natural-breaks")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть тему" }));

    await waitFor(() => expect(screen.queryByTestId("curriculum-topic-inspector")).not.toBeInTheDocument());
    expect(topicButton).toHaveFocus();
  });

  it("keeps only one topic selected and clears a selection removed by refresh", () => {
    const secondTopic = { ...topic, id: "topic-travel", title: "Travel and airports" } as CurriculumTopic;
    const view = renderPanel(teacherProfile, { topics: { [course.id]: [topic, secondTopic] } });
    const firstButton = screen.getByRole("button", { name: "Открыть тему «Family and introductions»" });
    const secondButton = screen.getByRole("button", { name: "Открыть тему «Travel and airports»" });

    fireEvent.click(firstButton);
    fireEvent.click(secondButton);

    expect(firstButton).toHaveAttribute("aria-pressed", "false");
    expect(secondButton).toHaveAttribute("aria-pressed", "true");

    view.rerender(panelElement(teacherProfile, { topics: { [course.id]: [] } }));
    expect(screen.queryByTestId("curriculum-topic-inspector")).not.toBeInTheDocument();
    expect(screen.getByTestId("curriculum-board")).toHaveAttribute("data-inspector-open", "false");
  });

  it("selects and opens a topic returned by a successful create mutation", async () => {
    render(<TopicCreationHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Добавить тему" }));
    fireEvent.change(screen.getByPlaceholderText("Путешествия"), { target: { value: "New topic" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить тему" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "New topic" })).toBeInTheDocument());
    expect(screen.getByTestId("curriculum-topic-inspector")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Путешествия")).not.toBeInTheDocument();
  });

  it("reveals only the requested management form", () => {
    renderPanel(teacherProfile);

    expect(screen.queryByPlaceholderText("English A1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Новый уровень" }));
    expect(screen.getByPlaceholderText("English A1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Открыть тему «Family and introductions»" }));
    expect(screen.queryByDisplayValue("Family and introductions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("curriculum-lesson-create-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("curriculum-card-add-form")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Настройки темы" }));
    expect(screen.getByDisplayValue("Family and introductions")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Новый урок" }));
    expect(screen.getByTestId("curriculum-lesson-create-form")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Добавить карточку" }));
    expect(screen.getByTestId("curriculum-card-add-form")).toBeInTheDocument();
  });

  it("keeps topic creation limited to one level at a time", () => {
    const secondCourse = { ...course, id: "course-a2", level: "A2", title: "Next Adventures" } as Course;
    renderPanel(teacherProfile, {
      courses: [course, secondCourse],
      lessons: { [course.id]: [lesson], [secondCourse.id]: [] },
      topics: { [course.id]: [topic], [secondCourse.id]: [] },
    });

    const topicButtons = screen.getAllByRole("button", { name: "Добавить тему" });
    fireEvent.click(topicButtons[0]);
    expect(screen.getAllByPlaceholderText("Путешествия")).toHaveLength(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Добавить тему" })[0]);
    expect(screen.getAllByPlaceholderText("Путешествия")).toHaveLength(1);
  });

  it("opens a read-only inspector for students", () => {
    renderPanel(studentProfile);

    expect(screen.queryByRole("button", { name: "Новый уровень" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить тему" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Открыть тему «Family and introductions»" }));

    expect(screen.getByTestId("curriculum-topic-inspector")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Настройки темы" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Новый урок" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить урок" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Закрыть тему" })).toBeInTheDocument();
  });

  it("keeps horizontal overflow on the level scroller only", () => {
    renderPanel(teacherProfile);

    expect(screen.getByTestId("curriculum-levels-scroller")).toHaveClass("overflow-x-auto", "overscroll-x-contain");
    expect(screen.getByTestId("curriculum-program")).toHaveClass("min-w-0", "max-w-full");
    expect(screen.getByTestId("curriculum-board")).not.toHaveClass("overflow-x-auto");
  });
});

function TopicCreationHarness() {
  const [currentTopics, setCurrentTopics] = useState<Record<string, CurriculumTopic[]>>({ [course.id]: [] });

  async function createTopic(_courseId: string, input: CurriculumTopicInput) {
    const createdTopic = {
      ...topic,
      description: input.description ?? null,
      id: "topic-created",
      orderIndex: input.orderIndex ?? null,
      tagSlugs: input.tagSlugs,
      title: input.title,
    } as CurriculumTopic;
    setCurrentTopics({ [course.id]: [createdTopic] });
    return createdTopic;
  }

  return panelElement(teacherProfile, { onCreateTopic: createTopic, topics: currentTopics });
}

function renderPanel(
  profile: MeProfile,
  overrides: Partial<Parameters<typeof panelElement>[1]> = {},
) {
  return render(panelElement(profile, overrides));
}

function panelElement(
  profile: MeProfile,
  overrides: {
    courses?: Course[];
    lessons?: Record<string, CourseLesson[]>;
    onCreateTopic?: (courseId: string, input: CurriculumTopicInput) => Promise<CurriculumTopic | null>;
    topics?: Record<string, CurriculumTopic[]>;
  } = {},
) {
  return (
    <AppProviders>
      <CourseWorkspacePanel
        courses={overrides.courses ?? [course]}
        disabled={false}
        lessons={overrides.lessons ?? { [course.id]: [lesson] }}
        loading={false}
        materials={[material]}
        message={null}
        onCreateCourse={() => undefined}
        onCreateLesson={() => undefined}
        onCreateTopic={overrides.onCreateTopic ?? (async () => null)}
        onDeleteCourse={() => undefined}
        onDeleteLesson={() => undefined}
        onDeleteTopic={() => undefined}
        onRefresh={() => undefined}
        onReplaceLessonCards={() => undefined}
        onUpdateTopic={() => undefined}
        profile={profile}
        topics={overrides.topics ?? { [course.id]: [topic] }}
      />
    </AppProviders>
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
