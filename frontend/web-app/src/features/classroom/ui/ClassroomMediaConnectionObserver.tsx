import { useRoomContext } from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";
import { useEffect } from "react";

export type ClassroomMediaConnectionLifecycle = "connected" | "reconnecting" | "disconnected";

export function ClassroomMediaConnectionObserver({
  onLifecycleChange,
}: {
  onLifecycleChange: (lifecycle: ClassroomMediaConnectionLifecycle) => void;
}) {
  const room = useRoomContext();

  useEffect(() => {
    function report(state: ConnectionState) {
      const lifecycle = classroomMediaConnectionLifecycle(state);
      if (lifecycle) onLifecycleChange(lifecycle);
    }

    report(room.state);
    room.on(RoomEvent.ConnectionStateChanged, report);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, report);
    };
  }, [onLifecycleChange, room]);

  return null;
}

export function classroomMediaConnectionLifecycle(
  state: ConnectionState,
): ClassroomMediaConnectionLifecycle | null {
  if (state === ConnectionState.Connected) return "connected";
  if (state === ConnectionState.Disconnected) return "disconnected";
  if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) {
    return "reconnecting";
  }
  return null;
}
