export function useWhiteboardPresentation() { return false; }
export function useWhiteboardRuntime() {
  return { elements: [], status: "connected", camera: null, cursors: [], runtime: { patch() {}, remove() {}, cursor() {}, stopCapturing() {}, publishCamera() {}, undo() {}, redo() {} } };
}
export function useLessonLibraryGame() { return { canControl: false, error: null, launch: null, protocolReady: false, refresh() {}, stop() {} }; }
export function useLiveVocabularyPractice() { return { practice: null }; }
