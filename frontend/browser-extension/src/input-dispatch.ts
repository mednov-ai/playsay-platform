import { inputResult, type ExternalInput, type InputResult, type PageCommand } from "./protocol";
import { pointerButtonMask, trustedInputCommand } from "./trusted-input";

export type DispatchViewport = {
  height: number;
  refreshedAt: number;
  revision: number;
  width: number;
};

export type DispatchSession = {
  inputEnabled: boolean;
  inputResults?: InputResult[];
  pressedButtons?: number;
  targetTabId: number;
  viewport?: DispatchViewport;
};

const maximumRememberedResults = 500;
export const maximumViewportAgeMs = 2_000;

export function createInputDispatcher({
  now = () => Date.now(),
  refreshViewport,
  sendCommand,
  targetAvailable,
}: {
  now?: () => number;
  refreshViewport: (session: DispatchSession) => Promise<void>;
  sendCommand: (targetTabId: number, method: string, params: Record<string, unknown>) => Promise<void>;
  targetAvailable: (targetTabId: number) => Promise<boolean>;
}) {
  return async (command: PageCommand, session: DispatchSession | null): Promise<InputResult> => {
    const remembered = session?.inputResults?.find((candidate) => candidate.eventId === command.eventId);
    if (remembered) return remembered;

    const finish = (result: InputResult) => {
      if (session) {
        session.inputResults = [...(session.inputResults ?? []), result].slice(-maximumRememberedResults);
      }
      return result;
    };

    if (!session) return finish(inputResult(command, "STALE_SESSION"));
    if (!session.inputEnabled) return finish(inputResult(command, "INPUT_DISABLED"));
    if (!await targetAvailable(session.targetTabId)) {
      return finish(inputResult(command, "TARGET_UNAVAILABLE"));
    }

    if (!session.viewport || now() - session.viewport.refreshedAt > maximumViewportAgeMs) {
      try {
        await refreshViewport(session);
      } catch {
        return finish(inputResult(command, "VIEWPORT_STALE"));
      }
    }
    const viewport = session.viewport;
    if (!viewport || viewport.width <= 0 || viewport.height <= 0) {
      return finish(inputResult(command, "VIEWPORT_STALE"));
    }

    const input = command.input as ExternalInput;
    if (input.type === "pointer") {
      const nextMask = pointerButtonMask(input);
      if (nextMask >= 0) session.pressedButtons = nextMask;
    }
    const trusted = trustedInputCommand(input, viewport, session.pressedButtons ?? 0);
    try {
      await sendCommand(session.targetTabId, trusted.method, trusted.params);
      return finish(inputResult(command, "DISPATCHED", viewport.revision));
    } catch {
      return finish(inputResult(command, "DEBUGGER_FAILED", viewport.revision));
    }
  };
}
