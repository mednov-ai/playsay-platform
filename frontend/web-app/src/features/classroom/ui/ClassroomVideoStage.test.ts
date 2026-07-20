import { describe, expect, it } from "vitest";
import type { ScheduledLesson } from "../../../shared/api/playsay";
import { classroomCameraSlots, classroomScreenShareTrack } from "./ClassroomVideoStage";

describe("classroomCameraSlots", () => {
  const participants = [
    { subject: "student-1", username: "student-one", displayName: "Student One" },
    { subject: "student-2", username: "student-two", displayName: "Student Two" },
  ] as ScheduledLesson["participants"];

  it("keeps expected students before the local teacher and carries presence", () => {
    const slots = classroomCameraSlots(
      [track("teacher-1", true)],
      participants,
      { "student-1": "ONLINE", "student-2": "CHECKING_DEVICES" },
      true,
    );

    expect(slots.map((slot) => slot.kind === "track" ? slot.trackRef.participant.identity : `${slot.subject}:${slot.state}`)).toEqual([
      "student-1:ONLINE",
      "student-2:CHECKING_DEVICES",
      "teacher-1",
    ]);
  });

  it("replaces an expected placeholder with the connected LiveKit participant", () => {
    const slots = classroomCameraSlots(
      [track("teacher-1", true), track("student-1", false)],
      participants,
      { "student-1": "CHECKING_DEVICES" },
      true,
    );

    expect(slots.filter((slot) => slot.kind === "placeholder").map((slot) => slot.subject)).toEqual(["student-2"]);
    expect(slots[0].kind === "track" && slots[0].trackRef.participant.identity).toBe("student-1");
  });

  it("does not expose expected participant presence to students", () => {
    const slots = classroomCameraSlots([track("student-1", true)], participants, {}, false);
    expect(slots).toHaveLength(1);
    expect(slots[0].kind).toBe("track");
  });

  it("uses the local teacher screen share when it is the active presentation", () => {
    const localScreenShare = track("teacher-1", true, "screen_share");

    expect(classroomScreenShareTrack([localScreenShare])).toBe(localScreenShare);
  });

  it("prefers a remote screen share when local and remote shares are both published", () => {
    const localScreenShare = track("teacher-1", true, "screen_share");
    const remoteScreenShare = track("student-1", false, "screen_share");

    expect(classroomScreenShareTrack([localScreenShare, remoteScreenShare])).toBe(remoteScreenShare);
  });

  it("keeps external activity capture out of the generic screen share stage", () => {
    const external = track("teacher-1", false, "screen_share", "playsay-external-activity-session-1-video");

    expect(classroomScreenShareTrack([external])).toBeUndefined();
  });
});

function track(identity: string, isLocal: boolean, source = "camera", trackName?: string) {
  return {
    participant: { identity, isLocal, sid: `${identity}-sid` },
    publication: { trackName },
    source,
  } as Parameters<typeof classroomCameraSlots>[0][number];
}
