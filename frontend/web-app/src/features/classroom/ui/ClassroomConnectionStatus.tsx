import {
  useConnectionQualityIndicator,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import type { Participant } from "livekit-client";
import { RoomEvent } from "livekit-client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useAppTranslation } from "../../../shared/i18n";
import {
  averageConnectionIndicator,
  learnerOverallConnectionIndicator,
  participantConnectionIndicator,
  roomConnectionIndicator,
  teacherOverallConnectionIndicator,
  type ConnectionIndicator,
} from "../model/connectionIndicators";

type Translation = (key: string, options?: Record<string, unknown>) => string;

export function ClassroomConnectionStatus({
  canManageLesson,
  learnerSubjects,
}: {
  canManageLesson: boolean;
  learnerSubjects: string[];
}) {
  const { t } = useAppTranslation();
  const { localParticipant } = useLocalParticipant();
  const roomState = useConnectionState();
  const participants = useParticipants({ updateOnlyOn: [RoomEvent.ConnectionQualityChanged] });
  const localQuality = useConnectionQualityIndicator({ participant: localParticipant }).quality;
  const localIndicator = participantConnectionIndicator(localQuality);
  const serverIndicator = roomConnectionIndicator(roomState);
  const learnerSubjectSet = useMemo(() => new Set(learnerSubjects), [learnerSubjects]);
  const learners = useMemo(
    () => participants
      .filter((participant) => !participant.isLocal && learnerSubjectSet.has(participant.identity))
      .sort((left, right) => participantName(left, t).localeCompare(participantName(right, t))),
    [learnerSubjectSet, participants, t],
  );
  const learnerIndicators = learners.map((participant) => participantConnectionIndicator(participant.connectionQuality));
  const learnerAverage = averageConnectionIndicator(learnerIndicators);
  const overallIndicator = canManageLesson
    ? teacherOverallConnectionIndicator(localIndicator, serverIndicator, learnerAverage)
    : learnerOverallConnectionIndicator(localIndicator, serverIndicator);
  const overallLabel = t("classroom.connection.overallAnnouncement", {
    status: statusText(overallIndicator, t),
  });

  if (!canManageLesson) {
    return (
      <span
        aria-label={overallLabel}
        aria-live="polite"
        className="playsay-connection-status playsay-connection-status-passive"
        role="status"
      >
        <ConnectionAntenna indicator={overallIndicator} />
      </span>
    );
  }

  return (
    <TeacherConnectionOverview
      learnerAverage={learnerAverage}
      learners={learners}
      localIndicator={localIndicator}
      overallIndicator={overallIndicator}
      overallLabel={overallLabel}
      serverIndicator={serverIndicator}
    />
  );
}

function TeacherConnectionOverview({
  learnerAverage,
  learners,
  localIndicator,
  overallIndicator,
  overallLabel,
  serverIndicator,
}: {
  learnerAverage: ConnectionIndicator;
  learners: Participant[];
  localIndicator: ConnectionIndicator;
  overallIndicator: ConnectionIndicator;
  overallLabel: string;
  serverIndicator: ConnectionIndicator;
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const popupId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: globalThis.PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }

    function onFocusIn(event: FocusEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      className="playsay-connection-status"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      ref={rootRef}
    >
      <button
        aria-controls={popupId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("classroom.connection.openOverview", { status: statusText(overallIndicator, t) })}
        className="playsay-connection-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={buttonRef}
        type="button"
      >
        <ConnectionAntenna indicator={overallIndicator} />
      </button>
      <span aria-live="polite" className="playsay-visually-hidden" role="status">{overallLabel}</span>
      {open ? (
        <div
          aria-label={t("classroom.connection.overviewTitle")}
          className="playsay-connection-popover"
          id={popupId}
          role="dialog"
        >
          <div className="playsay-connection-popover-title">{t("classroom.connection.overviewTitle")}</div>
          <ConnectionRow indicator={localIndicator} label={t("classroom.connection.teacher")} />
          <ConnectionRow indicator={serverIndicator} label={t("classroom.connection.server")} />
          <p className="playsay-connection-server-hint">{t("classroom.connection.serverHint")}</p>
          <ConnectionRow indicator={learnerAverage} label={t("classroom.connection.learners")} />
          {learners.map((participant) => (
            <ParticipantConnectionRow key={participant.identity} participant={participant} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ParticipantConnectionRow({ participant }: { participant: Participant }) {
  const { t } = useAppTranslation();
  const { quality } = useConnectionQualityIndicator({ participant });
  return <ConnectionRow indicator={participantConnectionIndicator(quality)} label={participantName(participant, t)} />;
}

function ConnectionRow({ indicator, label }: { indicator: ConnectionIndicator; label: string }) {
  const { t } = useAppTranslation();
  const state = statusText(indicator, t);
  return (
    <div aria-label={t("classroom.connection.rowAnnouncement", { label, status: state })} className="playsay-connection-row">
      <span className="playsay-connection-row-label" title={label}>{label}</span>
      <ConnectionAntenna indicator={indicator} />
      <span className="playsay-connection-row-state">{state}</span>
    </div>
  );
}

export function ConnectionAntenna({ indicator }: { indicator: ConnectionIndicator }) {
  return (
    <span
      aria-hidden="true"
      className="playsay-connection-antenna"
      data-level={indicator.bars}
      data-tone={indicator.tone}
    >
      {[1, 2, 3, 4].map((bar) => <span data-filled={bar <= indicator.bars ? "true" : "false"} key={bar} />)}
    </span>
  );
}

export function ClassroomParticipantConnectionDot({
  enabled,
  participant,
}: {
  enabled: boolean;
  participant: Participant;
}) {
  const { t } = useAppTranslation();
  const { quality } = useConnectionQualityIndicator({ participant });
  const indicator = participantConnectionIndicator(quality);
  if (!enabled || participant.isLocal || indicator.tone === "neutral") return null;
  const name = participantName(participant, t);
  return (
    <span
      aria-label={t("classroom.connection.participantAnnouncement", {
        name,
        status: statusText(indicator, t),
      })}
      className="playsay-connection-dot"
      data-tone={indicator.tone}
      role="img"
      title={statusText(indicator, t)}
    />
  );
}

function statusText(indicator: ConnectionIndicator, t: Translation): string {
  return t(`classroom.connection.states.${indicator.statusKey}`);
}

function participantName(participant: Participant, t: Translation): string {
  return participant.name?.trim() || participant.identity?.trim() || t("classroom.participantFallback");
}
