import { ArrowLeft, RefreshCw, Unplug } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Button } from "../../../../components/ui/button";
import { useAppTranslation } from "../../../../shared/i18n";
import type { MaterialEditorBlock, MaterialExternalActivitySync } from "../../model/materialDocument";

export function ExternalActivityFrame({ block, sync }: { block: MaterialEditorBlock; sync: MaterialExternalActivitySync }) {
  const { t } = useAppTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);
  const lastMoveRef = useRef(0);
  const active = sync.active;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = sync.mediaStream;
    if (sync.mediaStream) void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [sync.mediaStream]);

  function point(event: PointerEvent | WheelEvent) {
    const surface = surfaceRef.current;
    const video = videoRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      normalizedX: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      normalizedY: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
      x: Math.round(((event.clientX - rect.left) / rect.width) * (video?.videoWidth || 1280)),
      y: Math.round(((event.clientY - rect.top) / rect.height) * (video?.videoHeight || 720)),
    };
  }

  function pointer(event: PointerEvent<HTMLDivElement>, action: "move" | "down" | "up") {
    const position = point(event);
    if (!position) return;
    const now = performance.now();
    if (action === "move" && now - lastMoveRef.current < 33) return;
    lastMoveRef.current = now;
    sync.sendCursor(position.normalizedX, position.normalizedY);
    if (action === "move") return;
    sync.sendInput({
      type: "pointer",
      action,
      x: position.x,
      y: position.y,
      normalizedX: position.normalizedX,
      normalizedY: position.normalizedY,
      button: event.button === 1 ? "middle" : event.button === 2 ? "right" : "left",
      clickCount: event.detail || 1,
    });
  }

  function keyboard(event: KeyboardEvent<HTMLElement>, action: "down" | "up") {
    if (event.key === "Tab") event.preventDefault();
    sync.sendInput({
      type: "key",
      action,
      key: event.key,
      code: event.code,
      text: action === "down" && event.key.length === 1 ? event.key : "",
      modifiers: (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0),
    });
  }

  const waiting = !active || active.phase === "REQUESTED" || active.phase === "AWAITING_EXTENSION" || active.phase === "STARTING";

  return (
    <section className="playsay-external-activity-frame" data-phase={active?.phase ?? "IDLE"}>
      <header className="playsay-external-activity-toolbar">
        <div>
          <strong>{block.title}</strong>
          <small>{block.provider ?? "EXPERIMENTAL"}</small>
        </div>
        {sync.isHost ? (
          <div className="playsay-external-activity-actions">
            <Button onClick={sync.reload} type="button" variant="outline"><RefreshCw className="h-4 w-4" />{t("materials.externalActivity.reload")}</Button>
            <Button onClick={sync.returnToLesson} type="button"><ArrowLeft className="h-4 w-4" />{t("materials.externalActivity.returnToLesson")}</Button>
          </div>
        ) : null}
      </header>

      <div
        aria-label={t("materials.externalActivity.interactionSurface")}
        className="playsay-external-activity-surface"
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => keyboard(event, "down")}
        onKeyUp={(event) => keyboard(event, "up")}
        onPointerDown={(event) => {
          event.currentTarget.focus();
          mobileInputRef.current?.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          pointer(event, "down");
        }}
        onPointerMove={(event) => pointer(event, "move")}
        onPointerUp={(event) => pointer(event, "up")}
        onWheel={(event) => {
          const position = point(event);
          if (position) sync.sendInput({
            type: "scroll",
            x: position.x,
            y: position.y,
            normalizedX: position.normalizedX,
            normalizedY: position.normalizedY,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
          });
        }}
        ref={surfaceRef}
        role="application"
        tabIndex={0}
      >
        <video autoPlay className="playsay-external-activity-video" muted={!sync.isHost} playsInline ref={videoRef} />
        <input
          aria-label={t("materials.externalActivity.mobileKeyboard")}
          className="playsay-external-activity-mobile-input"
          inputMode="text"
          onChange={(event) => {
            for (const character of event.currentTarget.value) {
              sync.sendInput({ type: "key", action: "down", key: character, text: character, code: "", modifiers: 0 });
              sync.sendInput({ type: "key", action: "up", key: character, text: "", code: "", modifiers: 0 });
            }
            event.currentTarget.value = "";
          }}
          onKeyDown={(event) => { event.stopPropagation(); if (event.key.length > 1) keyboard(event, "down"); }}
          onKeyUp={(event) => { event.stopPropagation(); if (event.key.length > 1) keyboard(event, "up"); }}
          ref={mobileInputRef}
          type="text"
        />
        {sync.cursors.map((cursor) => (
          <span
            className="playsay-external-activity-cursor"
            key={cursor.identity}
            style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%`, "--playsay-cursor-color": cursor.color } as React.CSSProperties}
          >
            <i />
            <b>{cursor.name}</b>
          </span>
        ))}
        {waiting ? (
          <div className="playsay-external-activity-state" data-testid="external-activity-waiting">
            <Unplug className="h-8 w-8 text-primary" />
            <strong>{active?.phase === "AWAITING_EXTENSION" && sync.isHost
              ? t("materials.externalActivity.clickExtension")
              : t("materials.externalActivity.waitingForTeacher")}</strong>
            <span>{t("materials.externalActivity.waitingHint")}</span>
          </div>
        ) : null}
        {active?.phase === "ERROR" ? (
          <div className="playsay-external-activity-state" role="alert">
            <Unplug className="h-8 w-8 text-destructive" />
            <strong>{t("materials.externalActivity.error")}</strong>
            <span>{active.errorCode ?? t("materials.externalActivity.errorUnknown")}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
