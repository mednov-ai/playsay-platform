import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { CourseLessonMap } from "../../../entities/schedule/model";
import {
  removeCourse,
  removeCourseLesson,
  saveCourse,
  saveCourseLesson,
  type CourseInput,
  type CourseLesson,
  type CourseLessonInput,
} from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import type { SessionErrorHandler } from "../../../app/controller/types";
import { fetchCourseBundle, type CourseBundle } from "./courseBundle";

export const courseQueryKeys = {
  all: ["courses"] as const,
  bundle: () => [...courseQueryKeys.all, "bundle"] as const,
};

type CourseMutationRequest =
  | { type: "createCourse"; input: CourseInput }
  | { type: "createLesson"; courseId: string; input: CourseLessonInput }
  | { type: "deleteCourse"; courseId: string }
  | { type: "deleteLesson"; courseId: string; lessonId: string };

export function setCourseBundleQueryData(queryClient: QueryClient, bundle: CourseBundle) {
  queryClient.setQueryData(courseQueryKeys.bundle(), bundle);
}

export function setCourseLessonsForCourseQueryData(
  queryClient: QueryClient,
  courseId: string,
  lessons: CourseLesson[],
) {
  queryClient.setQueryData<CourseBundle>(courseQueryKeys.bundle(), (current) => ({
    courses: current?.courses ?? [],
    lessons: {
      ...(current?.lessons ?? {}),
      [courseId]: lessons,
    },
  }));
}

export function useCourseWorkspaceData({
  applySessionError,
  enabled,
}: {
  applySessionError: SessionErrorHandler;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { t } = useAppTranslation();
  const [courseMessage, setCourseMessage] = useState<string | null>(null);
  const courseBundleQuery = useQuery({
    enabled,
    queryFn: fetchCourseBundle,
    queryKey: courseQueryKeys.bundle(),
  });
  const courseMutation = useMutation({
    mutationFn: applyCourseMutation,
    onError: (caught, request) => {
      setCourseMessage(applySessionError(caught, failureMessageForCourseMutation(t, request)));
    },
    onMutate: () => {
      setCourseMessage(null);
    },
    onSuccess: (bundle, request) => {
      setCourseBundleQueryData(queryClient, bundle);
      setCourseMessage(successMessageForCourseMutation(t, request));
    },
  });

  useEffect(() => {
    if (courseBundleQuery.error) {
      setCourseMessage(applySessionError(courseBundleQuery.error, t("courses.messages.refreshFailed")));
    }
  }, [courseBundleQuery.error]);

  async function refreshCourses() {
    setCourseMessage(null);
    try {
      const bundle = await queryClient.fetchQuery({
        queryFn: fetchCourseBundle,
        queryKey: courseQueryKeys.bundle(),
      });
      setCourseBundleQueryData(queryClient, bundle);
      setCourseMessage(t("courses.messages.refreshed"));
    } catch (caught) {
      setCourseMessage(applySessionError(caught, t("courses.messages.refreshFailed")));
    }
  }

  async function createCourse(input: CourseInput) {
    try {
      await courseMutation.mutateAsync({ input, type: "createCourse" });
    } catch {
      // Error state is surfaced through courseMessage.
    }
  }

  async function deleteCourse(courseId: string) {
    try {
      await courseMutation.mutateAsync({ courseId, type: "deleteCourse" });
    } catch {
      // Error state is surfaced through courseMessage.
    }
  }

  async function createLesson(courseId: string, input: CourseLessonInput) {
    try {
      await courseMutation.mutateAsync({ courseId, input, type: "createLesson" });
    } catch {
      // Error state is surfaced through courseMessage.
    }
  }

  async function deleteLesson(courseId: string, lessonId: string) {
    try {
      await courseMutation.mutateAsync({ courseId, lessonId, type: "deleteLesson" });
    } catch {
      // Error state is surfaced through courseMessage.
    }
  }

  const bundle = courseBundleQuery.data;
  return {
    courseLessons: bundle?.lessons ?? ({} as CourseLessonMap),
    courseLoading: courseBundleQuery.isFetching || courseMutation.isPending,
    courseMessage,
    courses: bundle?.courses ?? [],
    createCourse,
    createLesson,
    deleteCourse,
    deleteLesson,
    refreshCourses,
    setCourseLessonsForCourse: (courseId: string, lessons: CourseLesson[]) => (
      setCourseLessonsForCourseQueryData(queryClient, courseId, lessons)
    ),
  };
}

async function applyCourseMutation(request: CourseMutationRequest): Promise<CourseBundle> {
  if (request.type === "createCourse") {
    await saveCourse(request.input);
    return fetchCourseBundle();
  }

  if (request.type === "deleteCourse") {
    await removeCourse(request.courseId);
    return fetchCourseBundle();
  }

  if (request.type === "createLesson") {
    await saveCourseLesson(request.courseId, request.input);
    return fetchCourseBundle();
  }

  await removeCourseLesson(request.courseId, request.lessonId);
  return fetchCourseBundle();
}

function successMessageForCourseMutation(t: ReturnType<typeof useAppTranslation>["t"], request: CourseMutationRequest) {
  if (request.type === "createCourse") {
    return t("courses.messages.created");
  }
  if (request.type === "deleteCourse") {
    return t("courses.messages.deleted");
  }
  if (request.type === "createLesson") {
    return t("courses.messages.lessonCreated");
  }
  return t("courses.messages.lessonDeleted");
}

function failureMessageForCourseMutation(t: ReturnType<typeof useAppTranslation>["t"], request: CourseMutationRequest) {
  if (request.type === "createCourse") {
    return t("courses.messages.createFailed");
  }
  if (request.type === "deleteCourse") {
    return t("courses.messages.deleteFailed");
  }
  if (request.type === "createLesson") {
    return t("courses.messages.lessonCreateFailed");
  }
  return t("courses.messages.lessonDeleteFailed");
}
