import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { CourseLessonMap } from "../../../entities/schedule/model";
import {
  editCourseLesson,
  editCurriculumTopic,
  removeCourse,
  removeCourseLesson,
  removeCurriculumTopic,
  saveCourse,
  saveCourseLesson,
  saveCourseLessonCards,
  saveCurriculumTopic,
  type CourseInput,
  type CourseLesson,
  type CourseLessonInput,
  type CurriculumTopic,
  type CurriculumTopicInput,
  type LessonTemplateCardsInput,
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
  | { type: "updateLesson"; courseId: string; lessonId: string; input: CourseLessonInput }
  | { type: "replaceLessonCards"; courseId: string; lessonId: string; input: LessonTemplateCardsInput }
  | { type: "createTopic"; courseId: string; input: CurriculumTopicInput }
  | { type: "updateTopic"; courseId: string; topicId: string; input: CurriculumTopicInput }
  | { type: "deleteCourse"; courseId: string }
  | { type: "deleteLesson"; courseId: string; lessonId: string }
  | { type: "deleteTopic"; courseId: string; topicId: string };

type CourseMutationResult = {
  bundle: CourseBundle;
  createdTopic: CurriculumTopic | null;
};

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
    topics: current?.topics ?? {},
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
    onSuccess: (result, request) => {
      setCourseBundleQueryData(queryClient, result.bundle);
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

  async function updateLesson(courseId: string, lessonId: string, input: CourseLessonInput) {
    try {
      await courseMutation.mutateAsync({ courseId, input, lessonId, type: "updateLesson" });
    } catch {
      // Error state is surfaced through courseMessage.
    }
  }

  async function replaceLessonCards(courseId: string, lessonId: string, input: LessonTemplateCardsInput) {
    try {
      await courseMutation.mutateAsync({ courseId, input, lessonId, type: "replaceLessonCards" });
    } catch {
      // Error state is surfaced through courseMessage.
    }
  }

  async function createTopic(courseId: string, input: CurriculumTopicInput) {
    try {
      const result = await courseMutation.mutateAsync({ courseId, input, type: "createTopic" });
      return result.createdTopic;
    } catch {
      // Error state is surfaced through courseMessage.
      return null;
    }
  }

  async function updateTopic(courseId: string, topicId: string, input: CurriculumTopicInput) {
    try {
      await courseMutation.mutateAsync({ courseId, input, topicId, type: "updateTopic" });
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

  async function deleteTopic(courseId: string, topicId: string) {
    try {
      await courseMutation.mutateAsync({ courseId, topicId, type: "deleteTopic" });
    } catch {
      // Error state is surfaced through courseMessage.
    }
  }

  const bundle = courseBundleQuery.data;
  return {
    courseLessons: bundle?.lessons ?? ({} as CourseLessonMap),
    courseLoading: courseBundleQuery.isFetching || courseMutation.isPending,
    courseMessage,
    courseTopics: bundle?.topics ?? {},
    courses: bundle?.courses ?? [],
    createCourse,
    createLesson,
    createTopic,
    deleteCourse,
    deleteLesson,
    deleteTopic,
    refreshCourses,
    replaceLessonCards,
    setCourseLessonsForCourse: (courseId: string, lessons: CourseLesson[]) => (
      setCourseLessonsForCourseQueryData(queryClient, courseId, lessons)
    ),
    updateLesson,
    updateTopic,
  };
}

async function applyCourseMutation(request: CourseMutationRequest): Promise<CourseMutationResult> {
  if (request.type === "createCourse") {
    await saveCourse(request.input);
    return resultWithBundle();
  }

  if (request.type === "deleteCourse") {
    await removeCourse(request.courseId);
    return resultWithBundle();
  }

  if (request.type === "createLesson") {
    await saveCourseLesson(request.courseId, request.input);
    return resultWithBundle();
  }

  if (request.type === "updateLesson") {
    await editCourseLesson(request.courseId, request.lessonId, request.input);
    return resultWithBundle();
  }

  if (request.type === "replaceLessonCards") {
    await saveCourseLessonCards(request.courseId, request.lessonId, request.input);
    return resultWithBundle();
  }

  if (request.type === "createTopic") {
    const createdTopic = await saveCurriculumTopic(request.courseId, request.input);
    return resultWithBundle(createdTopic);
  }

  if (request.type === "updateTopic") {
    await editCurriculumTopic(request.courseId, request.topicId, request.input);
    return resultWithBundle();
  }

  if (request.type === "deleteLesson") {
    await removeCourseLesson(request.courseId, request.lessonId);
    return resultWithBundle();
  }

  await removeCurriculumTopic(request.courseId, request.topicId);
  return resultWithBundle();
}

async function resultWithBundle(createdTopic: CurriculumTopic | null = null): Promise<CourseMutationResult> {
  return {
    bundle: await fetchCourseBundle(),
    createdTopic,
  };
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
  if (request.type === "updateLesson") {
    return t("courses.messages.lessonUpdated");
  }
  if (request.type === "replaceLessonCards") {
    return t("courses.messages.lessonCardsUpdated");
  }
  if (request.type === "createTopic") {
    return t("courses.messages.topicCreated");
  }
  if (request.type === "updateTopic") {
    return t("courses.messages.topicUpdated");
  }
  if (request.type === "deleteLesson") {
    return t("courses.messages.lessonDeleted");
  }
  return t("courses.messages.topicDeleted");
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
  if (request.type === "updateLesson") {
    return t("courses.messages.lessonUpdateFailed");
  }
  if (request.type === "replaceLessonCards") {
    return t("courses.messages.lessonCardsUpdateFailed");
  }
  if (request.type === "createTopic") {
    return t("courses.messages.topicCreateFailed");
  }
  if (request.type === "updateTopic") {
    return t("courses.messages.topicUpdateFailed");
  }
  if (request.type === "deleteLesson") {
    return t("courses.messages.lessonDeleteFailed");
  }
  return t("courses.messages.topicDeleteFailed");
}
