import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export default function PdfDocumentAdapter({
  onError,
  src,
  visiblePageIndexes,
  zoom,
}: {
  onError: () => void;
  src: string;
  visiblePageIndexes: number[];
  zoom: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState(900);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setHostWidth(Math.max(240, host.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const pageWidth = Math.max(220, (hostWidth - (visiblePageIndexes.length - 1) * 12) / visiblePageIndexes.length) * zoom;
  return (
    <div className="playsay-pdf-pages" ref={hostRef}>
      <Document
        file={src}
        loading={null}
        onLoadError={onError}
        onSourceError={onError}
        options={{
          cMapUrl: "/pdfjs/cmaps/",
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
        }}
      >
        {visiblePageIndexes.map((pageIndex) => (
          <Page
            key={pageIndex}
            pageNumber={pageIndex + 1}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            width={pageWidth}
          />
        ))}
      </Document>
    </div>
  );
}
