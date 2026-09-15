// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { ConnectionState, RoomEvent } from "livekit-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassroomMediaConnectionObserver } from "./ClassroomMediaConnectionObserver";

const mocks = vi.hoisted(() => {
  const listeners = new Set<(state: ConnectionState) => void>();
  return {
    listeners,
    room: {
      off: vi.fn((_event: RoomEvent, listener: (state: ConnectionState) => void) => listeners.delete(listener)),
      on: vi.fn((_event: RoomEvent, listener: (state: ConnectionState) => void) => listeners.add(listener)),
      state: "connected" as ConnectionState,
    },
  };
});

vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => mocks.room,
}));

afterEach(() => {
  cleanup();
  mocks.listeners.clear();
  mocks.room.off.mockClear();
  mocks.room.on.mockClear();
  mocks.room.state = ConnectionState.Connected;
});

describe("ClassroomMediaConnectionObserver", () => {
  it("reports only stable recovery lifecycle states", () => {
    const onLifecycleChange = vi.fn();
    render(<ClassroomMediaConnectionObserver onLifecycleChange={onLifecycleChange} />);

    expect(onLifecycleChange).toHaveBeenCalledWith("connected");
    const listener = [...mocks.listeners][0];
    listener(ConnectionState.Connecting);
    listener(ConnectionState.SignalReconnecting);
    listener(ConnectionState.Reconnecting);
    listener(ConnectionState.Disconnected);

    expect(onLifecycleChange.mock.calls).toEqual([
      ["connected"],
      ["reconnecting"],
      ["reconnecting"],
      ["disconnected"],
    ]);
  });

  it("cleans up its listener and keeps exactly one subscription across remounts", () => {
    const onLifecycleChange = vi.fn();
    const first = render(<ClassroomMediaConnectionObserver onLifecycleChange={onLifecycleChange} />);
    const firstListener = [...mocks.listeners][0];

    expect(mocks.listeners).toHaveLength(1);
    first.unmount();
    expect(mocks.listeners).toHaveLength(0);
    expect(mocks.room.off).toHaveBeenCalledWith(RoomEvent.ConnectionStateChanged, firstListener);

    const second = render(<ClassroomMediaConnectionObserver onLifecycleChange={onLifecycleChange} />);
    expect(mocks.listeners).toHaveLength(1);
    expect(mocks.room.on).toHaveBeenCalledTimes(2);
    second.rerender(<ClassroomMediaConnectionObserver onLifecycleChange={onLifecycleChange} />);
    expect(mocks.listeners).toHaveLength(1);
    expect(mocks.room.on).toHaveBeenCalledTimes(2);
  });
});
