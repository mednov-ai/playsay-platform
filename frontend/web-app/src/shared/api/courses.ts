import {
  createCourse,
  createCourseLesson,
  createCurriculumTopic,
  deleteCourse,
  deleteCourseLesson,
  deleteCurriculumTopic,
  listCourseLessons,
  listCourses,
  listCurriculumTopics,
  replaceCourseLessonCards,
  updateCourseLesson,
  updateCurriculumTopic,
  type CourseLessonRequest,
  type CurriculumTopicRequest,
  type LessonTemplateCardsRequest,
} from "../../generated/playsay-api";
import { authConfig, clearTokens } from "./auth";
import { apiErrorFromData } from "./errors";
import { authorizedOptions } from "./http";
import type { Course, CourseInput, CourseLesson, CourseLessonInput, CurriculumTopic, CurriculumTopicInput, LessonTemplateCardsInput } from "./types";

export async function fetchCourses(config = authConfig): Promise<Course[]> {
  const response = await listCourses(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Courses request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchCourseLessons(courseId: string, config = authConfig): Promise<CourseLesson[]> {
  const response = await listCourseLessons(courseId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course lessons request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchCurriculumTopics(courseId: string, config = authConfig): Promise<CurriculumTopic[]> {
  const response = await listCurriculumTopics(courseId, await authorizedOptions(config));
  const status = response.status as number;

  if (status === 401) {
    clearTokens();
  }

  if (status !== 200) {
    throw apiErrorFromData(status, response.data as unknown, `Curriculum topics request failed with HTTP ${status}.`);
  }

  return response.data;
}

export async function saveCourse(input: CourseInput, config = authConfig): Promise<Course> {
  const response = await createCourse(input, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 201) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course create failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function removeCourse(courseId: string, config = authConfig): Promise<void> {
  const response = await deleteCourse(courseId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 204) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course delete failed with HTTP ${response.status}.`);
  }
}

export async function saveCourseLesson(
  courseId: string,
  input: CourseLessonInput,
  config = authConfig,
): Promise<CourseLesson> {
  const response = await createCourseLesson(courseId, input as CourseLessonRequest, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 201) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course lesson create failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function saveCurriculumTopic(
  courseId: string,
  input: CurriculumTopicInput,
  config = authConfig,
): Promise<CurriculumTopic> {
  const response = await createCurriculumTopic(courseId, input as CurriculumTopicRequest, await authorizedOptions(config));
  const status = response.status as number;

  if (status === 401) {
    clearTokens();
  }

  if (status !== 200 && status !== 201) {
    throw apiErrorFromData(status, response.data as unknown, `Curriculum topic create failed with HTTP ${status}.`);
  }

  return response.data;
}

export async function editCourseLesson(
  courseId: string,
  lessonId: string,
  input: CourseLessonInput,
  config = authConfig,
): Promise<CourseLesson> {
  const response = await updateCourseLesson(courseId, lessonId, input as CourseLessonRequest, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course lesson update failed with HTTP ${response.status}.`);
  }

  return response.data as CourseLesson;
}

export async function editCurriculumTopic(
  courseId: string,
  topicId: string,
  input: CurriculumTopicInput,
  config = authConfig,
): Promise<CurriculumTopic> {
  const response = await updateCurriculumTopic(courseId, topicId, input as CurriculumTopicRequest, await authorizedOptions(config));
  const status = response.status as number;

  if (status === 401) {
    clearTokens();
  }

  if (status !== 200) {
    throw apiErrorFromData(status, response.data as unknown, `Curriculum topic update failed with HTTP ${status}.`);
  }

  return response.data;
}

export async function saveCourseLessonCards(
  courseId: string,
  lessonId: string,
  input: LessonTemplateCardsInput,
  config = authConfig,
): Promise<CourseLesson> {
  const response = await replaceCourseLessonCards(courseId, lessonId, input as LessonTemplateCardsRequest, await authorizedOptions(config));
  const status = response.status as number;

  if (status === 401) {
    clearTokens();
  }

  if (status !== 200) {
    throw apiErrorFromData(status, response.data as unknown, `Course lesson cards update failed with HTTP ${status}.`);
  }

  return response.data as CourseLesson;
}

export async function removeCourseLesson(
  courseId: string,
  lessonId: string,
  config = authConfig,
): Promise<void> {
  const response = await deleteCourseLesson(courseId, lessonId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 204) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course lesson delete failed with HTTP ${response.status}.`);
  }
}

export async function removeCurriculumTopic(
  courseId: string,
  topicId: string,
  config = authConfig,
): Promise<void> {
  const response = await deleteCurriculumTopic(courseId, topicId, await authorizedOptions(config));
  const status = response.status as number;

  if (status === 401) {
    clearTokens();
  }

  if (status !== 200 && status !== 204) {
    throw apiErrorFromData(status, response.data as unknown, `Curriculum topic delete failed with HTTP ${status}.`);
  }
}
