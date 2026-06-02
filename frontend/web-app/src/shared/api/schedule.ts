import {
  createScheduledLesson,
  createScheduledLessonRoomToken,
  deleteScheduledLesson,
  getScheduledLesson,
  listScheduledLessons,
  updateScheduledLesson,
  type ScheduledLessonRequest,
} from "../../generated/playsay-api";
import { authConfig, clearTokens } from "./auth";
import { apiErrorFromData } from "./errors";
import { authorizedOptions } from "./http";
import type { LiveKitRoomToken, ScheduledLesson, ScheduledLessonInput } from "./types";

export async function fetchScheduledLessons(config = authConfig): Promise<ScheduledLesson[]> {
  const response = await listScheduledLessons(await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Schedule request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function fetchScheduledLesson(
  lessonId: string,
  config = authConfig,
): Promise<ScheduledLesson> {
  const response = await getScheduledLesson(lessonId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson request failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function saveScheduledLesson(
  input: ScheduledLessonInput,
  config = authConfig,
): Promise<ScheduledLesson> {
  const response = await createScheduledLesson(input as ScheduledLessonRequest, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 201) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson create failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function editScheduledLesson(
  lessonId: string,
  input: ScheduledLessonInput,
  config = authConfig,
): Promise<ScheduledLesson> {
  const response = await updateScheduledLesson(lessonId, input as ScheduledLessonRequest, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson update failed with HTTP ${response.status}.`);
  }

  return response.data;
}

export async function removeScheduledLesson(lessonId: string, config = authConfig): Promise<void> {
  const response = await deleteScheduledLesson(lessonId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 204) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson delete failed with HTTP ${response.status}.`);
  }
}

export async function enterScheduledLessonRoom(lessonId: string, config = authConfig): Promise<LiveKitRoomToken> {
  const response = await createScheduledLessonRoomToken(lessonId, await authorizedOptions(config));

  if (response.status === 401) {
    clearTokens();
  }

  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Video room token request failed with HTTP ${response.status}.`);
  }

  return response.data;
}
