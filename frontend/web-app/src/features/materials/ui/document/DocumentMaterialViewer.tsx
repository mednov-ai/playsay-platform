import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Columns2, Loader2, Maximize2, Minimize2, Minus, Plus, Rows2 } from "lucide-react";
import type { MaterialEditorBlock } from "../../model/materialDocument";
import { useAppTranslation } from "../../../../shared/i18n";

const PdfDocumentAdapter = lazy(() => import("./PdfDocumentAdapter"));
const PptxDocumentAdapter = lazy(() => import("./PptxDocumentAdapter"));

class DocumentViewerErrorBoundary extends Component<{
  children: ReactNode;
  onError: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export type DocumentViewerState = {
  pageIndex: number;
  pdfLayout: "SINGLE" | "SPREAD";
  pdfSeparateCover: boolean;
  zoom: number;
};

export function defaultDocumentViewerState(block: MaterialEditorBlock): DocumentViewerState {
  return {
    pageIndex: 0,
    pdfLayout: block.documentPdfLayout ?? "SINGLE",
    pdfSeparateCover: block.documentPdfSeparateCover ?? true,
    zoom: 1,
  };
}

export function DocumentMaterialViewer({
  block,
  canControlPage = true,
  expanded,
  onExpandedChange,
  onStateChange,
  src,
  state,
}: {
  block: MaterialEditorBlock;
  canControlPage?: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onStateChange: (state: DocumentViewerState) => void;
  src?: string;
  state: DocumentViewerState;
}) {
  const { t } = useAppTranslation();
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const pageCount = Math.max(1, block.documentPages?.length ?? 0);
  const visiblePageIndexes = useMemo(
    () => documentVisiblePageIndexes(state.pageIndex, pageCount, state.pdfLayout, state.pdfSeparateCover),
    [pageCount, state.pageIndex, state.pdfLayout, state.pdfSeparateCover],
  );
  const nextIndex = documentNextPageIndex(state.pageIndex, pageCount, state.pdfLayout, state.pdfSeparateCover);
  const previousIndex = documentPreviousPageIndex(state.pageIndex, state.pdfLayout, state.pdfSeparateCover);
  const patch = (next: Partial<DocumentViewerState>) => onStateChange({ ...state, ...next });

  return (
    <div className="playsay-document-viewer" data-expanded={expanded ? "true" : "false"} data-format={block.documentFormat}>
      <div className="playsay-document-toolbar" role="toolbar" aria-label={t("materials.document.toolbar")}>
        <strong>{block.title}</strong>
        <span className="playsay-document-toolbar-spacer" />
        {block.documentFormat === "PDF" ? (
          <>
            <button
              aria-label={t("materials.document.singlePage")}
              data-active={state.pdfLayout === "SINGLE" ? "true" : "false"}
              disabled={!canControlPage}
              onClick={() => patch({ pdfLayout: "SINGLE" })}
              type="button"
            ><Rows2 /></button>
            <button
              aria-label={t("materials.document.spread")}
              data-active={state.pdfLayout === "SPREAD" ? "true" : "false"}
              disabled={!canControlPage}
              onClick={() => patch({ pdfLayout: "SPREAD" })}
              type="button"
            ><Columns2 /></button>
          </>
        ) : null}
        <button aria-label={t("materials.document.zoomOut")} onClick={() => patch({ zoom: Math.max(0.5, state.zoom - 0.1) })} type="button"><Minus /></button>
        <span aria-live="polite" className="playsay-document-zoom">{Math.round(state.zoom * 100)}%</span>
        <button aria-label={t("materials.document.zoomIn")} onClick={() => patch({ zoom: Math.min(2.5, state.zoom + 0.1) })} type="button"><Plus /></button>
        <button
          aria-label={expanded ? t("materials.document.restorePanel") : t("materials.document.expand")}
          onClick={() => onExpandedChange(!expanded)}
          type="button"
        >{expanded ? <Minimize2 /> : <Maximize2 />}</button>
      </div>
      {block.documentFormat === "PDF" && state.pdfLayout === "SPREAD" ? (
        <label className="playsay-document-cover-option">
          <input
            checked={state.pdfSeparateCover}
            disabled={!canControlPage}
            onChange={(event) => patch({ pageIndex: 0, pdfSeparateCover: event.target.checked })}
            type="checkbox"
          />
          {t("materials.document.separateCover")}
        </label>
      ) : null}
      <div
        className="playsay-document-stage"
        data-playsay-annotation-anchor="true"
        data-playsay-annotation-anchor-id={`${block.id}:${block.documentRevision ?? "unknown"}:${visiblePageIndexes.join("+")}`}
      >
        {!src ? (
          <div className="playsay-document-message">{t("materials.document.unavailable")}</div>
        ) : loadError ? (
          <button className="playsay-document-message" onClick={() => { setLoadAttempt((attempt) => attempt + 1); setLoadError(false); }} type="button">
            {t("materials.document.retry")}
          </button>
        ) : (
          <DocumentViewerErrorBoundary key={`${src}:${loadAttempt}`} onError={() => setLoadError(true)}>
            <Suspense fallback={<div className="playsay-document-message"><Loader2 className="animate-spin" />{t("materials.document.loading")}</div>}>
              {block.documentFormat === "PPTX" ? (
                <PptxDocumentAdapter
                  fileName={block.title}
                  onError={() => setLoadError(true)}
                  onPageIndexChange={(pageIndex) => {
                    if (canControlPage && pageIndex !== state.pageIndex) patch({ pageIndex });
                  }}
                  pageIndex={state.pageIndex}
                  src={src}
                  zoom={state.zoom}
                />
              ) : (
                <PdfDocumentAdapter
                  onError={() => setLoadError(true)}
                  src={src}
                  visiblePageIndexes={visiblePageIndexes}
                  zoom={state.zoom}
                />
              )}
            </Suspense>
          </DocumentViewerErrorBoundary>
        )}
      </div>
      <div className="playsay-document-navigation">
        <button aria-label={t("materials.document.previous")} disabled={!canControlPage || previousIndex === null} onClick={() => previousIndex !== null && patch({ pageIndex: previousIndex })} type="button"><ChevronLeft /></button>
        <span>{t("materials.document.pageStatus", { current: state.pageIndex + 1, total: pageCount })}</span>
        <button aria-label={t("materials.document.next")} disabled={!canControlPage || nextIndex === null} onClick={() => nextIndex !== null && patch({ pageIndex: nextIndex })} type="button"><ChevronRight /></button>
      </div>
    </div>
  );
}

export function documentVisiblePageIndexes(
  current: number,
  count: number,
  layout: "SINGLE" | "SPREAD",
  separateCover: boolean,
): number[] {
  const safe = Math.min(Math.max(0, current), Math.max(0, count - 1));
  if (layout === "SINGLE" || count <= 1 || (separateCover && safe === 0)) return [safe];
  const start = separateCover
    ? (safe % 2 === 1 ? safe : safe - 1)
    : (safe % 2 === 0 ? safe : safe - 1);
  return [Math.max(0, start), start + 1].filter((index) => index < count);
}

function documentNextPageIndex(current: number, count: number, layout: "SINGLE" | "SPREAD", separateCover: boolean): number | null {
  if (current >= count - 1) return null;
  if (layout === "SINGLE") return current + 1;
  if (separateCover && current === 0) return count > 1 ? 1 : null;
  const visible = documentVisiblePageIndexes(current, count, layout, separateCover);
  const next = Math.max(...visible) + 1;
  return next < count ? next : null;
}

function documentPreviousPageIndex(current: number, layout: "SINGLE" | "SPREAD", separateCover: boolean): number | null {
  if (current <= 0) return null;
  if (layout === "SINGLE") return current - 1;
  if (separateCover && current <= 2) return 0;
  return Math.max(0, current - 2);
}
