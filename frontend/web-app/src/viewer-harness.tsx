import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/fredoka";
import "@fontsource-variable/manrope";
import "./shared/i18n/config";
import "./styles.css";
import "./styles/materials.css";
import "./styles/viewer-harness.css";
import { DocumentMaterialViewer, defaultDocumentViewerState, type DocumentViewerState } from "./features/materials/ui/document/DocumentMaterialViewer";
import type { MaterialEditorBlock } from "./features/materials/model/materialDocument";

const pdfBlock = block("pdf", "PDF fixture", "PDF", 3, 595, 842);
const pdfRetryBlock = block("pdf-retry", "PDF retry fixture", "PDF", 3, 595, 842);
const pptxBlock = block("pptx", "PPTX fixture", "PPTX", 2, 960, 540);

function block(id: string, title: string, format: "PDF" | "PPTX", pages: number, width: number, height: number): MaterialEditorBlock {
  return {
    id,
    type: "document",
    title,
    documentAssetId: `${id}-asset`,
    documentFormat: format,
    documentRevision: `${id}-revision-1`,
    documentPages: Array.from({ length: pages }, (_, index) => ({ id: `${id}-page-${index + 1}`, index, width, height })),
    documentPdfLayout: "SINGLE",
    documentPdfSeparateCover: true,
  };
}

function HarnessViewer({ block, src }: { block: MaterialEditorBlock; src: string }) {
  const [state, setState] = useState<DocumentViewerState>(() => defaultDocumentViewerState(block));
  const [expanded, setExpanded] = useState(false);
  return (
    <section data-testid={`${block.id}-fixture`} className="viewer-harness-card">
      <DocumentMaterialViewer block={block} expanded={expanded} onExpandedChange={setExpanded} onStateChange={setState} src={src} state={state} />
    </section>
  );
}

function Harness() {
  return <main className="viewer-harness"><HarnessViewer block={pdfBlock} src="/viewer-fixtures/fixture.pdf" /><HarnessViewer block={pptxBlock} src="/viewer-fixtures/fixture.pptx" /><HarnessViewer block={pdfRetryBlock} src="/viewer-fixtures/retry.pdf" /></main>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><Harness /></React.StrictMode>);
