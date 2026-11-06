// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomVideoStage } from "./ClassroomVideoStage";

const state = vi.hoisted(() => ({ tracks: [] as unknown[], cameras: [] as unknown[], audioMounts: 0, audioUnmounts: 0, toastMounts: 0, toastUnmounts: 0 }));
vi.mock("@livekit/components-react", () => ({
  useTracks: (sources: { source: string }[]) => sources[0].source === "screen_share" ? state.tracks : state.cameras,
  ParticipantTile: ({ trackRef }: { trackRef: { participant: { identity: string }; publication?: { isMuted?: boolean } } }) => (
    <video data-testid="share-video" data-participant={trackRef.participant.identity} data-camera-off={trackRef.publication?.isMuted ? "true" : undefined} />
  ),
  RoomAudioRenderer: () => {
    useEffect(() => { state.audioMounts += 1; return () => { state.audioUnmounts += 1; }; }, []);
    return <audio data-testid="room-audio" />;
  },
  ConnectionStateToast: () => {
    useEffect(() => { state.toastMounts += 1; return () => { state.toastUnmounts += 1; }; }, []);
    return <div data-testid="connection-toast" />;
  },
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
afterEach(() => { cleanup(); state.tracks = []; state.cameras = []; state.audioMounts = 0; state.audioUnmounts = 0; state.toastMounts = 0; state.toastUnmounts = 0; });

describe("local screen-share mirror protection", () => {
  it("renders exactly three static levels without local video playback across layout changes", () => {
    state.tracks = [share(true)];
    const { container, rerender } = render(<ClassroomVideoStage {...props} />);
    const preview = screen.getByTestId("screen-share-bounded-preview");
    expect(container.querySelector('[data-local-screen-share="true"]')).toContainElement(preview);
    expect(screen.getByText("classroom.screenSharePreviewHint")).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop sharing" })).toBeEnabled();
    rerender(<ClassroomVideoStage {...props} mode="focusOnly" fullscreenActive />);
    expect(screen.getByTestId("screen-share-bounded-preview")).toBe(preview);
    expect(screen.queryByTestId("share-video")).toBeNull();
    expect(preview.querySelectorAll("[data-mirror-depth]")).toHaveLength(3);
    expect(preview.querySelector("[data-mirror-depth=\"3\"] video")).toBeNull();
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
  it("keeps room audio and controls mounted when tablet camera view switches to screen share and back", () => {
    state.cameras = [
      { source: "camera", participant: { identity: "student-2", isLocal: false, sid: "student-2" } },
      { source: "camera", participant: { identity: "teacher", isLocal: false, sid: "teacher" } },
      { source: "camera", participant: { identity: "student-1", isLocal: true, sid: "student-1" } },
    ];
    const { container, rerender } = render(<ClassroomVideoStage {...props} mode="tabletFloating" teacherSubject="teacher" />);
    const audio = screen.getByTestId("room-audio");
    expect(container.querySelector(".playsay-tablet-teacher-video video")).toHaveAttribute("data-participant", "teacher");
    expect(container.querySelector(".playsay-tablet-local-video video")).toHaveAttribute("data-participant", "student-1");
    expect(screen.getByRole("button", { name: "Stop sharing" })).toBeEnabled();
    state.tracks = [share(false)];
    rerender(<ClassroomVideoStage {...props} mode="focusOnly" teacherSubject="teacher" />);
    expect(screen.getByTestId("room-audio")).toBe(audio);
    expect(state.audioMounts).toBe(1);
    expect(state.audioUnmounts).toBe(0);
    expect(screen.getByRole("button", { name: "Stop sharing" })).toBeEnabled();
    state.tracks = [];
    rerender(<ClassroomVideoStage {...props} mode="tabletFloating" teacherSubject="teacher" />);
    expect(screen.getByTestId("room-audio")).toBe(audio);
    expect(state.audioUnmounts).toBe(0);
  });
  it("keeps the same audio renderer and connection toast across every video layout", () => {
    const view = render(<ClassroomVideoStage {...props} mode="tabletFloating" />);
    const audio = screen.getByTestId("room-audio");
    const toast = screen.getByTestId("connection-toast");

    for (const mode of ["externalActivity", "videoOnly", "lesson", "focusOnly", "tabletFloating"] as const) {
      view.rerender(<ClassroomVideoStage {...props} mode={mode} />);
      expect(screen.getByTestId("room-audio")).toBe(audio);
      expect(screen.getByTestId("connection-toast")).toBe(toast);
      expect(state.audioMounts).toBe(1);
      expect(state.audioUnmounts).toBe(0);
      expect(state.toastMounts).toBe(1);
      expect(state.toastUnmounts).toBe(0);
    }

    view.unmount();
    expect(state.audioUnmounts).toBe(1);
    expect(state.toastUnmounts).toBe(1);
  });
  it("lets the learner select an actual participant including camera-off and returns to the assigned teacher when they leave", () => {
    const teacher = { source: "camera", participant: { identity: "teacher", name: "Assigned Teacher", isLocal: false, sid: "teacher" } };
    const delegate = { source: "camera", publication: { isMuted: true }, participant: { identity: "delegate", name: "Substitute Name", isLocal: false, sid: "delegate" } };
    const local = { source: "camera", participant: { identity: "student", isLocal: true, sid: "student" } };
    state.cameras = [teacher, delegate, local];
    const { container, rerender } = render(<ClassroomVideoStage {...props} mode="tabletFloating" teacherSubject="teacher" />);
    fireEvent.click(screen.getByLabelText("classroom.floatingVideo.otherParticipants"));
    fireEvent.click(screen.getByRole("button", { name: "Substitute Name" }));
    expect(container.querySelector(".playsay-tablet-teacher-video video")).toHaveAttribute("data-participant", "delegate");
    expect(container.querySelector(".playsay-tablet-teacher-video video")).toHaveAttribute("data-camera-off", "true");
    expect(container.querySelector(".playsay-tablet-selected-label")).toHaveTextContent("Substitute Name");
    fireEvent.click(screen.getByLabelText("classroom.floatingVideo.otherParticipants"));
    expect(screen.getByRole("button", { name: "Assigned Teacher" })).toBeInTheDocument();
    state.cameras = [teacher, local];
    rerender(<ClassroomVideoStage {...props} mode="tabletFloating" teacherSubject="teacher" />);
    expect(container.querySelector(".playsay-tablet-teacher-video video")).toHaveAttribute("data-participant", "teacher");
    state.cameras = [teacher, delegate, local];
    rerender(<ClassroomVideoStage {...props} mode="tabletFloating" teacherSubject="teacher" />);
    expect(container.querySelector(".playsay-tablet-teacher-video video")).toHaveAttribute("data-participant", "teacher");
  });
  it("allows choosing a connected participant when the assigned teacher is absent and returning to the teacher placeholder", () => {
    state.cameras = [
      { source: "camera", participant: { identity: "delegate", name: "Substitute Name", isLocal: false, sid: "delegate" } },
      { source: "camera", participant: { identity: "other", name: "Other Learner", isLocal: false, sid: "other" } },
      { source: "camera", participant: { identity: "student", isLocal: true, sid: "student" } },
    ];
    const { container } = render(<ClassroomVideoStage {...props} mode="tabletFloating" teacherSubject="teacher" teacherName="Assigned Teacher" />);
    expect(container.querySelector(".playsay-tablet-teacher-video")).toHaveTextContent("Assigned Teacher");
    fireEvent.click(screen.getByLabelText("classroom.floatingVideo.otherParticipants"));
    fireEvent.click(screen.getByRole("button", { name: "Substitute Name" }));
    expect(container.querySelector(".playsay-tablet-teacher-video video")).toHaveAttribute("data-participant", "delegate");
    fireEvent.click(screen.getByLabelText("classroom.floatingVideo.otherParticipants"));
    expect(screen.getByRole("button", { name: "Other Learner" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "classroom.connection.teacher" }));
    expect(container.querySelector(".playsay-tablet-teacher-video")).toHaveTextContent("Assigned Teacher");
  });
});
