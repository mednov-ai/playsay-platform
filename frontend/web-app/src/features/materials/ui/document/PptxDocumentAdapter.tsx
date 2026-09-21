import { useCallback, useEffect, useRef, useState } from "react";
import { PowerPointViewer, type PowerPointViewerHandle, type ToolbarActionId } from "pptx-react-viewer";

const hiddenActions: ToolbarActionId[] = [
  "file", "home", "insert", "draw", "design", "transitions", "animations",
  "slideShow", "record", "review", "view", "help", "share", "broadcast", "export", "undo", "redo",
  "notes", "fullscreen", "zoom", "navigation",
];

export default function PptxDocumentAdapter({
  fileName,
  onError,
  onPageIndexChange,
  pageIndex,
  src,
  zoom,
}: {
  fileName: string;
  onError: () => void;
  onPageIndexChange: (pageIndex: number) => void;
  pageIndex: number;
  src: string;
  zoom: number;
}) {
  const viewerRef = useRef<PowerPointViewerHandle>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onPageIndexChangeRef = useRef(onPageIndexChange);
  onPageIndexChangeRef.current = onPageIndexChange;
  const handleActiveSlideChange = useCallback((nextPageIndex: number) => {
    onPageIndexChangeRef.current(nextPageIndex);
  }, []);
  const handleModeChange = useCallback((mode: string) => {
    if (mode !== "preview") viewerRef.current?.setMode("preview");
  }, []);
  const [content, setContent] = useState<Uint8Array | null>(null);
  useEffect(() => {
    const id = "playsay-pptx-viewer-styles";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "/vendor/pptx-viewer.css";
    document.head.appendChild(link);
  }, []);
  useEffect(() => {
    let active = true;
    setContent(null);
    fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`pptx-${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => active && setContent(new Uint8Array(buffer)))
      .catch(() => active && onErrorRef.current());
    return () => { active = false; };
  }, [src]);
  useEffect(() => {
    viewerRef.current?.goTo(pageIndex);
  }, [content, pageIndex]);
  useEffect(() => {
    viewerRef.current?.setZoom(zoom);
  }, [content, zoom]);
  if (!content) return null;
  return (
    <div className="playsay-pptx-static-viewer">
      <PowerPointViewer
        autosave={false}
        canEdit={false}
        content={content}
        fileName={fileName}
        fitPadding={0}
        hiddenActions={hiddenActions}
        maxFitScale={null}
        onActiveSlideChange={handleActiveSlideChange}
        onModeChange={handleModeChange}
        ref={viewerRef}
      />
    </div>
  );
}
