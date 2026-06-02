import type { Dispatch, SetStateAction } from "react";
import type { CourseLessonMap } from "../../entities/schedule/model";
import { fetchCourseBundle } from "../../features/courses";
import {
  fetchCourseLessons,
  fetchCourses,
  removeCourse,
  removeCourseLesson,
  saveCourse,
  saveCourseLesson,
  type Course,
  type CourseInput,
  type CourseLessonInput,
} from "../../shared/api/playsay";
import { useAppTranslation } from "../../shared/i18n";
import type { SessionErrorHandler } from "./types";

export function useCourseActions({
  applySessionError,
  setCourseLessons,
  setCourseLoading,
  setCourseMessage,
  setCourses,
}: {
  applySessionError: SessionErrorHandler;
  setCourseLessons: Dispatch<SetStateAction<CourseLessonMap>>;
  setCourseLoading: Dispatch<SetStateAction<boolean>>;
  setCourseMessage: Dispatch<SetStateAction<string | null>>;
  setCourses: Dispatch<SetStateAction<Course[]>>;
}) {
  const { t } = useAppTranslation();

  async function refreshCourses() {
    setCourseLoading(true);
    setCourseMessage(null);
    try {
      const bundle = await fetchCourseBundle();
      setCourses(bundle.courses);
      setCourseLessons(bundle.lessons);
      setCourseMessage(t("courses.messages.refreshed"));
    } catch (caught) {
      setCourseMessage(applySessionError(caught, t("courses.messages.refreshFailed")));
    } finally {
      setCourseLoading(false);
    }
  }

  async function createCourse(input: CourseInput) {
    setCourseLoading(true);
    setCourseMessage(null);
    try {
      await saveCourse(input);
      const bundle = await fetchCourseBundle();
      setCourses(bundle.courses);
      setCourseLessons(bundle.lessons);
      setCourseMessage(t("courses.messages.created"));
    } catch (caught) {
      setCourseMessage(applySessionError(caught, t("courses.messages.createFailed")));
    } finally {
      setCourseLoading(false);
    }
  }

  async function deleteCourse(courseId: string) {
    setCourseLoading(true);
    setCourseMessage(null);
    try {
      await removeCourse(courseId);
      setCourses((current) => current.filter((course) => course.id !== courseId));
      setCourseLessons((current) => {
        const next = { ...current };
        delete next[courseId];
        return next;
      });
      setCourseMessage(t("courses.messages.deleted"));
    } catch (caught) {
      setCourseMessage(applySessionError(caught, t("courses.messages.deleteFailed")));
    } finally {
      setCourseLoading(false);
    }
  }

  async function createLesson(courseId: string, input: CourseLessonInput) {
    setCourseLoading(true);
    setCourseMessage(null);
    try {
      await saveCourseLesson(courseId, input);
      const [freshCourses, lessons] = await Promise.all([fetchCourses(), fetchCourseLessons(courseId)]);
      setCourses(freshCourses);
      setCourseLessons((current) => ({ ...current, [courseId]: lessons }));
      setCourseMessage(t("courses.messages.lessonCreated"));
    } catch (caught) {
      setCourseMessage(applySessionError(caught, t("courses.messages.lessonCreateFailed")));
    } finally {
      setCourseLoading(false);
    }
  }

  async function deleteLesson(courseId: string, lessonId: string) {
    setCourseLoading(true);
    setCourseMessage(null);
    try {
      await removeCourseLesson(courseId, lessonId);
      const [freshCourses, lessons] = await Promise.all([fetchCourses(), fetchCourseLessons(courseId)]);
      setCourses(freshCourses);
      setCourseLessons((current) => ({ ...current, [courseId]: lessons }));
      setCourseMessage(t("courses.messages.lessonDeleted"));
    } catch (caught) {
      setCourseMessage(applySessionError(caught, t("courses.messages.lessonDeleteFailed")));
    } finally {
      setCourseLoading(false);
    }
  }

  return {
    createCourse,
    createLesson,
    deleteCourse,
    deleteLesson,
    refreshCourses,
  };
}
