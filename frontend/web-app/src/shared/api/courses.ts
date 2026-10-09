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
import { authConfig } from "./auth";
import { apiErrorFromData } from "./errors";
import { authorizedRequest } from "./http";
import type { Course, CourseInput, CourseLesson, CourseLessonInput, CurriculumTopic, CurriculumTopicInput, LessonTemplateCardsInput } from "./types";

export async function fetchCourses(config = authConfig): Promise<Course[]> {
  const response = await authorizedRequest(config, (options) => listCourses(options));


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Courses request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchCourseLessons(courseId: string, config = authConfig): Promise<CourseLesson[]> {
  const response = await authorizedRequest(config, (options) => listCourseLessons(courseId, options));


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course lessons request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchCurriculumTopics(courseId: string, config = authConfig): Promise<CurriculumTopic[]> {
  const response = await authorizedRequest(config, (options) => listCurriculumTopics(courseId, options));
  const status = response.status as number;


  if (status !== 200) {
    throw apiErrorFromData(status, response.data as unknown, `Curriculum topics request failed with HTTP ${status}.`);
  }

  return response.data;
}

export async function saveCourse(input: CourseInput, config = authConfig): Promise<Course> {
  const response = await authorizedRequest(config, (options) => createCourse(input, options));


  if (response.status !== 201) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course create failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function removeCourse(courseId: string, config = authConfig): Promise<void> {
  const response = await authorizedRequest(config, (options) => deleteCourse(courseId, options));


  if (response.status !== 204) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course delete failed with HTTP ${response.status}.`);
  }
}

export async function saveCourseLesson(
  courseId: string,
  input: CourseLessonInput,
  config = authConfig,
): Promise<CourseLesson> {
  const response = await authorizedRequest(config, (options) => createCourseLesson(courseId, input as CourseLessonRequest, options));


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
  const response = await authorizedRequest(config, (options) => createCurriculumTopic(courseId, input as CurriculumTopicRequest, options));
  const status = response.status as number;


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
  const response = await authorizedRequest(config, (options) => updateCourseLesson(courseId, lessonId, input as CourseLessonRequest, options));


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
  const response = await authorizedRequest(config, (options) => updateCurriculumTopic(courseId, topicId, input as CurriculumTopicRequest, options));
  const status = response.status as number;


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
  const response = await authorizedRequest(config, (options) => replaceCourseLessonCards(courseId, lessonId, input as LessonTemplateCardsRequest, options));
  const status = response.status as number;


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
  const response = await authorizedRequest(config, (options) => deleteCourseLesson(courseId, lessonId, options));


  if (response.status !== 204) {
    throw apiErrorFromData(response.status, response.data as unknown, `Course lesson delete failed with HTTP ${response.status}.`);
  }
}

export async function removeCurriculumTopic(
  courseId: string,
  topicId: string,
  config = authConfig,
): Promise<void> {
  const response = await authorizedRequest(config, (options) => deleteCurriculumTopic(courseId, topicId, options));
  const status = response.status as number;


  if (status !== 200 && status !== 204) {
    throw apiErrorFromData(status, response.data as unknown, `Curriculum topic delete failed with HTTP ${status}.`);
  }
}
