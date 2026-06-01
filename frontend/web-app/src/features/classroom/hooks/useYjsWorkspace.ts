import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCollaborationDocumentToken,
  type CollaborationDocument,
  type CollaborationDocumentToken,
  type LessonMaterialJson,
} from "../../../shared/api/playsay";
import {
  createYjsWorkspaceRuntime,
  type CollaborationCursor,
  type CollaborationParticipant,
  type YjsWorkspaceRuntime,
} from "./yjsRuntime";

export type { CollaborationCursor, CollaborationParticipant };

export type YjsWorkspaceStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export function useYjsWorkspace({
  color,
  document,
  enabled = true,
  participantName,
}: {
  color: string;
  document: CollaborationDocument | null;
  enabled?: boolean;
  participantName: string;
}) {
  const [participants, setParticipants] = useState<CollaborationParticipant[]>([]);
  const [status, setStatus] = useState<YjsWorkspaceStatus>("idle");
  const [text, setText] = useState("");
  const runtimeRef = useRef<YjsWorkspaceRuntime | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || !document) {
      setParticipants([]);
      setStatus("idle");
      setText("");
      return undefined;
    }

    let disposed = false;
    const runtime = createYjsWorkspaceRuntime({
      color,
      onParticipantsChange: setParticipants,
      onTextChange: setText,
      participantName,
      snapshot: document.snapshot,
    });
    runtimeRef.current = runtime;
    setStatus("connecting");

    void createCollaborationDocumentToken(document.lessonId, document.id)
      .then((tokenResponse) => {
        if (disposed) {
          return;
        }
        const socket = new WebSocket(collaborationWebSocketUrl(tokenResponse));
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;
        socket.onopen = () => {
          setStatus("connected");
          runtime.startSocketSync(socket);
        };
        socket.onmessage = (event) => {
          runtime.handleSocketMessage(event.data);
        };
        socket.onclose = () => {
          if (!disposed) {
            setStatus("disconnected");
          }
        };
        socket.onerror = () => {
          if (!disposed) {
            setStatus("error");
          }
        };
      })
      .catch(() => {
        if (!disposed) {
          setStatus("error");
        }
      });

    return () => {
      disposed = true;
      socketRef.current?.close();
      socketRef.current = null;
      runtime.destroy();
      runtimeRef.current = null;
      setParticipants([]);
    };
  }, [color, document?.id, enabled, participantName]);

  const updateText = useCallback((nextText: string) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      setText(nextText);
      return;
    }
    runtime.updateText(nextText);
  }, []);

  const updateCursor = useCallback((cursor: CollaborationCursor | null) => {
    runtimeRef.current?.updateCursor(cursor);
  }, []);

  const snapshot = useCallback((): LessonMaterialJson | null => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return null;
    }
    return runtime.snapshot();
  }, []);

  return {
    connected: status === "connected",
    participants,
    snapshot,
    status,
    text,
    updateCursor,
    updateText,
  };
}

function collaborationWebSocketUrl(tokenResponse: CollaborationDocumentToken): string {
  const base = tokenResponse.websocketUrl.startsWith("ws")
    ? new URL(tokenResponse.websocketUrl)
    : new URL(tokenResponse.websocketUrl, websocketOrigin());
  base.searchParams.set("room", tokenResponse.yjsDocumentId);
  base.searchParams.set("token", tokenResponse.token);
  return base.toString();
}

function websocketOrigin(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}
