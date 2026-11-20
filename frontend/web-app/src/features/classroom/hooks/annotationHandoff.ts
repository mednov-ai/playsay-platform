import { compareAnnotationElements, type AnnotationElement } from "../model/annotation";

export class AnnotationHandoff {
  private consumed = false;
  private readonly observedIds: Set<string>;

  constructor(
    private baseline: AnnotationElement[],
    private draft: AnnotationElement[],
    initial: AnnotationElement[],
  ) {
    this.observedIds = new Set(initial.map((element) => element.id));
  }

  take() {
    if (this.consumed) return null;
    this.consumed = true;
    return (current: AnnotationElement[]) => this.merge(current);
  }

  observe(elements: AnnotationElement[]) {
    for (const element of elements) this.observedIds.add(element.id);
  }

  merge(current: AnnotationElement[], draft = this.draft) {
    const present = new Set(current.map((element) => element.id));
    const deleted = new Set([...this.observedIds].filter((id) => !present.has(id)));
    return mergeLocalDraft(current, this.baseline, draft, deleted);
  }

  edit(current: AnnotationElement[], next: AnnotationElement[], live: AnnotationElement[]) {
    const baselineIds = new Set(this.baseline.map((element) => element.id));
    this.baseline = [...this.baseline, ...live.filter((element) => !baselineIds.has(element.id))];
    const liveIds = new Set(live.map((element) => element.id));
    const deleted = new Set([...this.observedIds].filter((id) => !liveIds.has(id)));
    this.draft = mergeLocalDraft(this.draft, current, next, deleted);
    return this.draft;
  }
}

// Transfer only locally changed fields; concurrent live elements and fields remain authoritative.
export function mergeLocalDraft(current: AnnotationElement[], baseline: AnnotationElement[], draft: AnnotationElement[], deletedIds: Set<string>): AnnotationElement[] {
  const before = new Map(baseline.map((element) => [element.id, element]));
  const after = new Map(draft.map((element) => [element.id, element]));
  const result = current.filter((element) => !before.has(element.id) || after.has(element.id));
  for (const element of draft) {
    if (deletedIds.has(element.id)) continue;
    const original = before.get(element.id);
    const index = result.findIndex((candidate) => candidate.id === element.id);
    if (JSON.stringify(original) === JSON.stringify(element)) continue;
    if (index === -1) { result.push(element); continue; }
    const patch = Object.fromEntries(Object.entries(element).filter(([key, value]) => (
      !original || JSON.stringify(value) !== JSON.stringify(original[key as keyof AnnotationElement])
    )));
    result[index] = { ...result[index], ...patch } as AnnotationElement;
  }
  return result.sort(compareAnnotationElements);
}
