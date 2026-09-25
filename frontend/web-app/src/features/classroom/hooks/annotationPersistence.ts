import { annotationContentFromJson, type AnnotationContent } from "../model/annotation";
import type { LessonMaterialJson } from "../../../shared/api/playsay";

const fingerprint = (content: unknown) => JSON.stringify(annotationContentFromJson(content));

// One session owns its requests, even when the canvas switches to another material.
export function createAnnotationPersistence({ load, save, onLoad }: {
  load: () => Promise<AnnotationContent>;
  save: (content: LessonMaterialJson) => Promise<unknown>;
  onLoad: (content: AnnotationContent) => void;
}) {
  let closed = false;
  let revision = 0;
  let request = 0;
  let acknowledged = "";
  let pending: LessonMaterialJson | null = null;
  let saving = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  async function flush() {
    clearTimeout(debounce);
    if (saving || !pending) return;
    const content = pending;
    const serialized = fingerprint(content);
    saving = true;
    let succeeded = false;
    try {
      await save(content);
      acknowledged = serialized;
      if (pending && fingerprint(pending) === serialized) pending = null;
      succeeded = true;
    } catch {
      // Keep the latest draft; the next poll or edit retries while the canvas is open.
    } finally {
      saving = false;
      if (pending && succeeded) void flush();
    }
  }

  async function refresh() {
    const startedAt = revision;
    const requestId = ++request;
    if (pending || saving) {
      void flush();
      return;
    }
    try {
      const content = await load();
      if (closed || requestId !== request || revision !== startedAt || pending || saving) return;
      const serialized = fingerprint(content);
      if (serialized !== acknowledged) {
        acknowledged = serialized;
        onLoad(content);
      }
    } catch {
      // A failed read is not an empty document and must never clear existing text.
    }
  }

  const interval = setInterval(() => { void refresh(); }, 2_000);
  void refresh();
  return {
    change(content: LessonMaterialJson) {
      const serialized = fingerprint(content);
      if (closed || (pending && serialized === fingerprint(pending)) || (!pending && serialized === acknowledged)) return;
      revision += 1;
      pending = content;
      clearTimeout(debounce);
      debounce = setTimeout(() => { void flush(); }, 500);
    },
    close() {
      closed = true;
      clearInterval(interval);
      clearTimeout(debounce);
      // Drain in order, including an edit queued behind an in-flight save.
      void flush();
    },
  };
}
