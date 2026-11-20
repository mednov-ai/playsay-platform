import { ApiError } from "../../../shared/api/errors";
import { annotationContentFromJson, type AnnotationContent } from "../model/annotation";
import type { LessonMaterialJson } from "../../../shared/api/playsay";

const fingerprint = (content: unknown) => JSON.stringify(annotationContentFromJson(content));

// One session owns its requests, even when the canvas switches to another material.
export function createAnnotationPersistence({ load, save, onLoad, onConflict }: {
  load: () => Promise<AnnotationContent>;
  save: (content: LessonMaterialJson) => Promise<unknown>;
  onLoad: (content: AnnotationContent) => void;
  onConflict: (base: AnnotationContent, draft: LessonMaterialJson) => void;
}) {
  let closed = false;
  let revision = 0;
  let request = 0;
  let acknowledged = "";
  let pending: LessonMaterialJson | null = null;
  let saving = false;
  let conflicted = false;
  let baseline = annotationContentFromJson(null);
  let latest: LessonMaterialJson | null = null;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  async function flush() {
    clearTimeout(debounce);
    if (saving || conflicted || !pending) return;
    const content = pending;
    const serialized = fingerprint(content);
    saving = true;
    let succeeded = false;
    try {
      await save(content);
      baseline = annotationContentFromJson(content);
      acknowledged = serialized;
      if (pending && fingerprint(pending) === serialized) pending = null;
      succeeded = true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.errorCode === "ANNOTATION_MATERIAL_CHANGED") {
        conflicted = true;
        onConflict(baseline, latest ?? content);
        pending = null;
      }
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
      if (conflicted) return;
      baseline = content;
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
    resume(content: AnnotationContent) {
      revision++;
      conflicted = false;
      baseline = content;
      acknowledged = fingerprint(content);
    },
    change(content: LessonMaterialJson) {
      if (closed) return;
      latest = content;
      if (conflicted) {
        onConflict(baseline, content);
        return;
      }
      const serialized = fingerprint(content);
      if ((pending && serialized === fingerprint(pending)) || (!pending && serialized === acknowledged)) return;
      revision += 1;
      pending = content;
      clearTimeout(debounce);
      debounce = setTimeout(() => { void flush(); }, 500);
    },
    close({ discardPending = false }: { discardPending?: boolean } = {}) {
      if (discardPending) pending = null;
      closed = true;
      clearInterval(interval);
      clearTimeout(debounce);
      // Drain in order, including an edit queued behind an in-flight save.
      void flush();
    },
  };
}
