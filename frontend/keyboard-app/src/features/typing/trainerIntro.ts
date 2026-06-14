export type TrainerIntroPhase = "visible" | "revealing" | "dismissed";

export type TrainerIntroEvent =
  | { type: "startReveal" }
  | { type: "completeReveal" }
  | { type: "resetTrainer" };

export const trainerIntroRevealMs = 680;

export function initialTrainerIntroPhase(introDismissed = false): TrainerIntroPhase {
  return introDismissed ? "dismissed" : "visible";
}

export function trainerIntroReducer(phase: TrainerIntroPhase, event: TrainerIntroEvent): TrainerIntroPhase {
  switch (event.type) {
    case "startReveal":
      return phase === "visible" ? "dismissed" : phase;
    case "completeReveal":
      return phase === "revealing" ? "dismissed" : phase;
    case "resetTrainer":
      return phase;
    default:
      return phase;
  }
}

export function isTrainerIntroBlocking(phase: TrainerIntroPhase): boolean {
  return phase === "visible" || phase === "revealing";
}

export function isTrainerChromeVisible(phase: TrainerIntroPhase): boolean {
  return phase !== "visible";
}
