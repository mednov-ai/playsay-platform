import {
  createCourse,
  createCourseLesson,
  deleteCourse,
  deleteCourseLesson,
  listCourseLessons,
  listCourses,
  updateCourseLesson,
  type CourseLessonRequest,
} from "../../generated/playsay-api";
import { authConfig, clearTokens } from "./auth";
import { apiErrorFromData } from "./errors";
import { authorizedOptions } from "./http";
import type { Course, CourseInput, CourseLesson, CourseLessonInput } from "./types";

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
