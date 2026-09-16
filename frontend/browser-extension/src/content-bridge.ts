import {
  inputResult,
  parseInputResult,
  type PageCommand,
} from "./protocol";

export async function forwardPageCommand(
  command: PageCommand,
  send: (command: PageCommand) => Promise<unknown>,
  post: (event: unknown) => void,
): Promise<void> {
  try {
    const response = await send(command);
    if (command.type !== "INPUT") return;
    post(parseInputResult(response, command) ?? inputResult(command, "BRIDGE_UNAVAILABLE"));
  } catch {
    if (command.type === "INPUT") post(inputResult(command, "BRIDGE_UNAVAILABLE"));
  }
}
