import { observeServerTime } from "../lib/serverClock";
import {
  createScheduledLesson,
  extendLessonAccess as extendLessonAccessGenerated,
  createScheduledLessonRoomToken,
  createLessonTranslationSession as createLessonTranslationSessionGenerated,
  completeScheduledLesson as completeScheduledLessonGenerated,
  deleteScheduledLesson,
  getScheduledLesson,
  listScheduledLessons,
  rescheduleScheduledLesson as rescheduleScheduledLessonGenerated,
  updateScheduledLesson,
  type ScheduledLessonScheduleUpdateRequest,
  type ScheduledLessonRequest,
} from "../../generated/playsay-api";
import { authConfig } from "./auth";
import { apiErrorFromData } from "./errors";
import { apiJson, authorizedRequest } from "./http";
import type { LessonAccessLink, LessonTranslationSession, LiveKitRoomToken, ScheduledLesson, ScheduledLessonInput, ScheduledLessonParticipantLinks } from "./types";

export async function fetchScheduledLessons(config = authConfig): Promise<ScheduledLesson[]> {
  const response = await authorizedRequest(config, (options) => listScheduledLessons(options));


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Schedule request failed with HTTP ${response.status}.`);
  }

  observeServerTime(response.data);
  return response.data;
}

export async function fetchScheduledLesson(
  lessonId: string,
  config = authConfig,
): Promise<ScheduledLesson> {
  const response = await authorizedRequest(config, (options) => getScheduledLesson(lessonId, options), 5000);


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson request failed with HTTP ${response.status}.`);
  }

  observeServerTime(response.data);
  return response.data;
}

export async function saveScheduledLesson(
  input: ScheduledLessonInput,
  config = authConfig,
): Promise<ScheduledLesson> {
  const response = await authorizedRequest(config, (options) => createScheduledLesson(input as ScheduledLessonRequest, options));


  if (response.status !== 201) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson create failed with HTTP ${response.status}.`);
  }

  observeServerTime(response.data);
  return response.data;
}

export async function editScheduledLesson(
  lessonId: string,
  input: ScheduledLessonInput,
  config = authConfig,
): Promise<ScheduledLesson> {
  const response = await authorizedRequest(config, (options) => updateScheduledLesson(lessonId, input as ScheduledLessonRequest, options));


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson update failed with HTTP ${response.status}.`);
  }

  observeServerTime(response.data);
  return response.data;
}

export async function rescheduleScheduledLesson(
  lessonId: string,
  input: ScheduledLessonScheduleUpdateRequest,
  config = authConfig,
): Promise<ScheduledLesson> {
  const response = await authorizedRequest(config, (options) => rescheduleScheduledLessonGenerated(lessonId, input, options));


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson reschedule failed with HTTP ${response.status}.`);
  }

  observeServerTime(response.data);
  return response.data;
}

export async function removeScheduledLesson(lessonId: string, config = authConfig): Promise<void> {
  const response = await authorizedRequest(config, (options) => deleteScheduledLesson(lessonId, options));


  if (response.status !== 204) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson delete failed with HTTP ${response.status}.`);
  }
}

export async function completeScheduledLesson(lessonId: string, config = authConfig): Promise<ScheduledLesson> {
  const response = await authorizedRequest(config, (options) => completeScheduledLessonGenerated(lessonId, options));


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Scheduled lesson complete failed with HTTP ${response.status}.`);
  }

  observeServerTime(response.data);
  return response.data;
}

export async function startScheduledLesson(lessonId: string, config = authConfig): Promise<ScheduledLesson> {
  return apiJson<ScheduledLesson>(
    `/api/schedule/lessons/${encodeURIComponent(lessonId)}/start`,
    { method: "POST" },
    config,
    200,
  );
}

export async function enterScheduledLessonRoom(lessonId: string, config = authConfig): Promise<LiveKitRoomToken> {
  const response = await authorizedRequest(config, (options) => createScheduledLessonRoomToken(lessonId, options));


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Video room token request failed with HTTP ${response.status}.`);
  }

  observeServerTime(response.data);
  return response.data;
}

export async function createLessonTranslationSession(
  lessonId: string,
  config = authConfig,
): Promise<LessonTranslationSession> {
  const response = await authorizedRequest(config, (options) => createLessonTranslationSessionGenerated(lessonId, options));


  if (response.status !== 200) {
    throw apiErrorFromData(response.status, response.data as unknown, `Translation session request failed with HTTP ${response.status}.`);
  }

  observeServerTime(response.data);
  return response.data;
}

export async function createScheduledLessonParticipantLinks(
  lessonId: string,
  config = authConfig,
): Promise<ScheduledLessonParticipantLinks> {
  return apiJson<ScheduledLessonParticipantLinks>(
    `/api/schedule/lessons/${encodeURIComponent(lessonId)}/participant-links`,
    { method: "POST" },
    config,
    200,
  );
}

export async function fetchLessonAccessLink(lessonId: string, config = authConfig): Promise<LessonAccessLink> {
  return apiJson<LessonAccessLink>(
    `/api/schedule/lessons/${encodeURIComponent(lessonId)}/access-link`,
    { method: "GET" },
    config,
  );
}

export async function extendScheduledLessonAccess(lessonId: string, expectedAccessRevision: number, config = authConfig): Promise<ScheduledLesson> {
  const response = await authorizedRequest(config, (options) => extendLessonAccessGenerated(lessonId, { expectedAccessRevision }, options), 5000);
  if (response.status !== 200) throw apiErrorFromData(response.status, response.data);
  observeServerTime(response.data);
  return response.data;
}
