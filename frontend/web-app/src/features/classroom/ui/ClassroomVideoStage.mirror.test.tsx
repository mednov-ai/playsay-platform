// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomVideoStage } from "./ClassroomVideoStage";

const state = vi.hoisted(() => ({ tracks: [] as unknown[] }));
vi.mock("@livekit/components-react", () => ({
  useTracks: (sources: { source: string }[]) => sources[0].source === "screen_share" ? state.tracks : [],
  ParticipantTile: ({ trackRef }: { trackRef: { participant: { identity: string } } }) => (
    <video data-testid="share-video" data-participant={trackRef.participant.identity} />
  ),
  RoomAudioRenderer: () => null,
  ConnectionStateToast: () => null,
}));
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../hooks/useLessonTranslation", () => ({
  useLessonTranslation: () => ({ captions: [], localEnabled: false, canEnable: false }),
}));
vi.mock("./ClassroomControlBar", () => ({ ClassroomControlBar: () => <button>Stop sharing</button> }));
vi.mock("./ClassroomConnectionStatus", () => ({ ClassroomParticipantConnectionDot: () => null }));

const props = {
  expectedParticipants: [], lessonId: "test", lessonType: "INDIVIDUAL", mode: "lesson" as const,
  canCompleteLesson: false, fullscreenActive: false, fullscreenLabel: "Fullscreen", fullscreenPending: false,
  onComplete: vi.fn(), onLeave: vi.fn(), onScreenShareActiveChange: vi.fn(), onToggleFullscreen: vi.fn(),
  participantPresence: {}, showExpectedParticipants: false, showLearnerConnectionDots: false,
  translationAllowed: false, translationRole: null,
};
function share(isLocal: boolean, trackName = "screen") {
  return { source: "screen_share", participant: { identity: isLocal ? "local" : "remote", isLocal }, publication: { trackName } };
}
afterEach(() => { cleanup(); state.tracks = []; });

describe("local screen-share mirror protection", () => {
  it("protects the local share and keeps its video mounted across layout changes", () => {
    state.tracks = [share(true)];
    const { container, rerender } = render(<ClassroomVideoStage {...props} />);
    const video = screen.getByTestId("share-video");
    expect(container.querySelector('[data-local-screen-share="true"]')).toContainElement(video);
    expect(screen.getByText("classroom.screenSharePreviewHint")).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop sharing" })).toBeEnabled();
    rerender(<ClassroomVideoStage {...props} mode="focusOnly" fullscreenActive />);
    expect(screen.getByTestId("share-video")).toBe(video);
    expect(container.querySelectorAll('[data-local-screen-share="true"]')).toHaveLength(1);
  });
  it("removes protection when a remote share takes priority while local sharing continues", () => {
    state.tracks = [share(true)];
    const { container, rerender } = render(<ClassroomVideoStage {...props} />);
    state.tracks = [share(true), share(false)];
    rerender(<ClassroomVideoStage {...props} />);
    expect(screen.getByTestId("share-video")).toHaveAttribute("data-participant", "remote");
    expect(container.querySelector('[data-local-screen-share="true"]')).toBeNull();
    expect(screen.queryByText("classroom.screenSharePreviewHint")).toBeNull();
  });
  it("clears protection on stop and restores one instance on restart", () => {
    state.tracks = [share(true)];
    const { container, rerender } = render(<ClassroomVideoStage {...props} />);
    state.tracks = [];
    rerender(<ClassroomVideoStage {...props} />);
    expect(screen.queryByTestId("share-video")).toBeNull();
    expect(screen.queryByText("classroom.screenSharePreviewHint")).toBeNull();
    expect(container.querySelector('[data-local-screen-share="true"]')).toBeNull();
    state.tracks = [share(true, "new-source")];
    rerender(<ClassroomVideoStage {...props} />);
    expect(container.querySelectorAll('[data-local-screen-share="true"]')).toHaveLength(1);
    expect(screen.getAllByText("classroom.screenSharePreviewHint")).toHaveLength(1);
  });
  it("does not protect external activity capture or its dedicated layout", () => {
    state.tracks = [share(true, "playsay-external-activity-session-video")];
    const { container, rerender } = render(<ClassroomVideoStage {...props} />);
    expect(container.querySelector('[data-local-screen-share="true"]')).toBeNull();
    expect(screen.queryByTestId("share-video")).toBeNull();
    state.tracks = [share(true)];
    rerender(<ClassroomVideoStage {...props} mode="externalActivity" />);
    expect(container.querySelector('[data-local-screen-share="true"]')).toBeNull();
    expect(screen.queryByText("classroom.screenSharePreviewHint")).toBeNull();
  });
});
