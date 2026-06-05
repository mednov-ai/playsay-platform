import type { SessionPhase } from "./sessionFlow";
import type { ChordSet, LayoutId } from "../../shared/types";

export function shouldReloadActiveSetForLayout(params: {
  layoutId: LayoutId;
  chordSet: ChordSet | null;
  phase: SessionPhase;
}): boolean {
  return params.phase === "idle" && params.chordSet != null && params.chordSet.layout === params.layoutId;
}
