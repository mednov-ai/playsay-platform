/** A sandboxed game retains focus inside this document; only an external return needs a new clock anchor. */
export function subscribeLessonClockResume(onResume: () => void): () => void {
  let externalFocusLost = !document.hasFocus();
  const resume = () => { externalFocusLost = false; onResume(); };
  const blurred = () => { externalFocusLost = !document.hasFocus(); };
  const focused = () => { if (externalFocusLost) resume(); };
  const visible = () => { if (document.visibilityState === "visible") resume(); };
  window.addEventListener("blur", blurred);
  window.addEventListener("focus", focused);
  window.addEventListener("pageshow", resume);
  window.addEventListener("online", resume);
  document.addEventListener("visibilitychange", visible);
  return () => {
    window.removeEventListener("blur", blurred);
    window.removeEventListener("focus", focused);
    window.removeEventListener("pageshow", resume);
    window.removeEventListener("online", resume);
    document.removeEventListener("visibilitychange", visible);
  };
}
