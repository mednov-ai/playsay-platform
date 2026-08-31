import { ConnectionQuality, ConnectionState } from "livekit-client";
import { describe, expect, it } from "vitest";
import {
  averageConnectionIndicator,
  learnerOverallConnectionIndicator,
  participantConnectionIndicator,
  roomConnectionIndicator,
  teacherOverallConnectionIndicator,
  worstConnectionIndicator,
} from "./connectionIndicators";

describe("participantConnectionIndicator", () => {
  it.each([
    [ConnectionQuality.Excellent, 4, "green", "excellent"],
    [ConnectionQuality.Good, 3, "green", "good"],
    [ConnectionQuality.Poor, 2, "yellow", "poor"],
    [ConnectionQuality.Lost, 1, "red", "lost"],
    [ConnectionQuality.Unknown, 0, "neutral", "unknown"],
  ] as const)("maps %s", (quality, bars, tone, statusKey) => {
    expect(participantConnectionIndicator(quality)).toEqual({ bars, tone, statusKey });
  });
});

describe("roomConnectionIndicator", () => {
  it.each([
    [ConnectionState.Connected, 3, "green", "good"],
    [ConnectionState.Reconnecting, 2, "yellow", "reconnecting"],
    [ConnectionState.SignalReconnecting, 2, "yellow", "reconnecting"],
    [ConnectionState.Disconnected, 1, "red", "lost"],
    [ConnectionState.Connecting, 0, "neutral", "unknown"],
  ] as const)("maps %s", (state, bars, tone, statusKey) => {
    expect(roomConnectionIndicator(state)).toEqual({ bars, tone, statusKey });
  });
});

describe("connection indicator aggregation", () => {
  const excellent = participantConnectionIndicator(ConnectionQuality.Excellent);
  const good = participantConnectionIndicator(ConnectionQuality.Good);
  const poor = participantConnectionIndicator(ConnectionQuality.Poor);
  const lost = participantConnectionIndicator(ConnectionQuality.Lost);
  const unknown = participantConnectionIndicator(ConnectionQuality.Unknown);

  it("rounds a learner average down and excludes unknown values", () => {
    expect(averageConnectionIndicator([excellent, good, unknown])).toEqual(good);
    expect(averageConnectionIndicator([excellent, poor])).toEqual(good);
    expect(averageConnectionIndicator([unknown])).toEqual(unknown);
  });

  it("selects the worst known category for teacher and learner overviews", () => {
    expect(teacherOverallConnectionIndicator(good, poor, excellent)).toEqual(poor);
    expect(learnerOverallConnectionIndicator(excellent, lost)).toEqual(lost);
    expect(learnerOverallConnectionIndicator(unknown, good)).toEqual(unknown);
    expect(worstConnectionIndicator([unknown, good])).toEqual(good);
    expect(worstConnectionIndicator([unknown])).toEqual(unknown);
  });
});
