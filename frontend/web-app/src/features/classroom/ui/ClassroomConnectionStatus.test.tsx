// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ConnectionQuality, ConnectionState, type Participant } from "livekit-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClassroomConnectionStatus,
  ClassroomParticipantConnectionDot,
} from "./ClassroomConnectionStatus";

const mocks = vi.hoisted(() => ({
  localParticipant: undefined as Participant | undefined,
  participants: [] as Participant[],
  roomState: undefined as ConnectionState | undefined,
}));

vi.mock("@livekit/components-react", () => ({
  useConnectionQualityIndicator: ({ participant }: { participant: Participant }) => ({
    quality: participant.connectionQuality,
  }),
  useConnectionState: () => mocks.roomState,
  useLocalParticipant: () => ({ localParticipant: mocks.localParticipant }),
  useParticipants: () => mocks.participants,
}));

const translations: Record<string, string> = {
  "classroom.connection.learners": "Ученики",
  "classroom.connection.openOverview": "Состояние связи: {{status}}. Открыть подробности",
  "classroom.connection.overallAnnouncement": "Связь: {{status}}",
  "classroom.connection.overviewTitle": "Состояние связи",
  "classroom.connection.participantAnnouncement": "Связь у {{name}}: {{status}}",
  "classroom.connection.rowAnnouncement": "{{label}}: {{status}}",
  "classroom.connection.server": "Сервер",
  "classroom.connection.serverHint": "Соединение этого устройства с сервером урока",
  "classroom.connection.states.excellent": "Отличная",
  "classroom.connection.states.good": "Хорошая",
  "classroom.connection.states.lost": "Потеряна",
  "classroom.connection.states.poor": "Нестабильная",
  "classroom.connection.states.reconnecting": "Восстанавливается",
  "classroom.connection.states.unknown": "Определяется",
  "classroom.connection.teacher": "Учитель",
  "classroom.participantFallback": "Участник",
};

vi.mock("../../../shared/i18n", () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => Object.entries(options ?? {}).reduce(
      (value, [name, replacement]) => value.replace(`{{${name}}}`, String(replacement)),
      translations[key] ?? key,
    ),
  }),
}));

function participant(
  identity: string,
  name: string,
  quality: ConnectionQuality,
  isLocal = false,
): Participant {
  return { connectionQuality: quality, identity, isLocal, name } as Participant;
}

beforeEach(() => {
  mocks.localParticipant = participant("teacher-1", "Teacher", ConnectionQuality.Excellent, true);
  mocks.participants = [mocks.localParticipant];
  mocks.roomState = ConnectionState.Connected;
});

afterEach(() => cleanup());

describe("ClassroomConnectionStatus", () => {
  it("renders a passive learner antenna without diagnostics or participant details", () => {
    mocks.localParticipant = participant("learner-1", "Maria", ConnectionQuality.Good, true);
    mocks.participants = [mocks.localParticipant, participant("teacher-1", "Teacher", ConnectionQuality.Poor)];

    const view = render(<ClassroomConnectionStatus canManageLesson={false} learnerSubjects={["learner-1"]} />);

    expect(screen.getByRole("status", { name: "Связь: Хорошая" })).toBeInTheDocument();
    expect(view.container.querySelector('.playsay-connection-antenna[data-level="3"][data-tone="green"]')).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Teacher")).not.toBeInTheDocument();
  });

  it("keeps an unresolved learner quality neutral instead of claiming a healthy connection", () => {
    mocks.localParticipant = participant("learner-1", "Maria", ConnectionQuality.Unknown, true);
    mocks.participants = [mocks.localParticipant];
    const view = render(<ClassroomConnectionStatus canManageLesson={false} learnerSubjects={["learner-1"]} />);

    expect(screen.getByRole("status", { name: "Связь: Определяется" })).toBeInTheDocument();
    expect(view.container.querySelector('.playsay-connection-antenna[data-level="0"][data-tone="neutral"]')).toBeInTheDocument();
  });

  it("opens a teacher overview and lists every connected learner even when no tile is rendered", () => {
    const maria = participant("learner-1", "Maria", ConnectionQuality.Poor);
    const alex = participant("learner-2", "Alex", ConnectionQuality.Excellent);
    mocks.participants = [mocks.localParticipant!, maria, alex];

    render(<ClassroomConnectionStatus canManageLesson learnerSubjects={["learner-1", "learner-2"]} />);
    const trigger = screen.getByRole("button", { name: /Открыть подробности/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const dialog = screen.getByRole("dialog", { name: "Состояние связи" });
    expect(within(dialog).getByText("Учитель")).toBeInTheDocument();
    expect(within(dialog).getByText("Сервер")).toBeInTheDocument();
    expect(within(dialog).getByText("Ученики")).toBeInTheDocument();
    expect(within(dialog).getByText("Alex")).toBeInTheDocument();
    expect(within(dialog).getByText("Maria")).toBeInTheDocument();
    expect(within(dialog).getByText("Соединение этого устройства с сервером урока")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Хорошая").length).toBeGreaterThan(0);
    expect(dialog.querySelectorAll(".playsay-connection-antenna > span")).toHaveLength(20);
  });

  it("dismisses by second activation, Escape, outside pointer, and outside focus without moving focus on state updates", () => {
    mocks.participants = [mocks.localParticipant!, participant("learner-1", "Maria", ConnectionQuality.Good)];
    render(
      <>
        <ClassroomConnectionStatus canManageLesson learnerSubjects={["learner-1"]} />
        <button type="button">Другой элемент</button>
      </>,
    );
    const trigger = screen.getByRole("button", { name: /Открыть подробности/ });

    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    trigger.focus();
    fireEvent.focusIn(screen.getByRole("button", { name: "Другой элемент" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("announces status changes politely and combines bar count, tone, and localized text", () => {
    mocks.participants = [mocks.localParticipant!, participant("learner-1", "Maria", ConnectionQuality.Poor)];
    const view = render(<ClassroomConnectionStatus canManageLesson learnerSubjects={["learner-1"]} />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveTextContent("Связь: Нестабильная");
    expect(view.container.querySelector('.playsay-connection-antenna[data-level="2"][data-tone="yellow"]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Открыть подробности/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Нестабильная");
  });

  it("updates from poor to lost and removes the warning after recovery", () => {
    const maria = participant("learner-1", "Maria", ConnectionQuality.Poor);
    mocks.participants = [mocks.localParticipant!, maria];
    const view = render(<ClassroomConnectionStatus canManageLesson learnerSubjects={["learner-1"]} />);
    expect(screen.getByRole("button", { name: /Нестабильная/ })).toBeInTheDocument();

    mocks.participants = [mocks.localParticipant!, participant("learner-1", "Maria", ConnectionQuality.Lost)];
    view.rerender(<ClassroomConnectionStatus canManageLesson learnerSubjects={["learner-1"]} />);
    expect(screen.getByRole("button", { name: /Потеряна/ })).toBeInTheDocument();

    mocks.participants = [mocks.localParticipant!, participant("learner-1", "Maria", ConnectionQuality.Good)];
    view.rerender(<ClassroomConnectionStatus canManageLesson learnerSubjects={["learner-1"]} />);
    expect(screen.getByRole("button", { name: /Хорошая/ })).toBeInTheDocument();
    expect(view.container.querySelector('.playsay-connection-antenna[data-level="3"][data-tone="green"]')).toBeInTheDocument();
  });
});

describe("ClassroomParticipantConnectionDot", () => {
  it("shows an accessible teacher-only dot for known remote quality", () => {
    const maria = participant("learner-1", "Maria", ConnectionQuality.Poor);
    const view = render(<ClassroomParticipantConnectionDot enabled participant={maria} />);
    expect(screen.getByRole("img", { name: "Связь у Maria: Нестабильная" })).toHaveAttribute("title", "Нестабильная");
    expect(view.container.querySelector('.playsay-connection-dot[data-tone="yellow"]')).toBeInTheDocument();
  });

  it("omits dots for learners, local participants, and unknown quality", () => {
    const maria = participant("learner-1", "Maria", ConnectionQuality.Good);
    const view = render(<ClassroomParticipantConnectionDot enabled={false} participant={maria} />);
    expect(view.container).toBeEmptyDOMElement();

    view.rerender(<ClassroomParticipantConnectionDot enabled participant={{ ...maria, isLocal: true } as Participant} />);
    expect(view.container).toBeEmptyDOMElement();

    view.rerender(<ClassroomParticipantConnectionDot enabled participant={{ ...maria, connectionQuality: ConnectionQuality.Unknown } as Participant} />);
    expect(view.container).toBeEmptyDOMElement();
  });
});
