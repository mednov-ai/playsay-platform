import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppTranslation } from "../../../shared/i18n";
import { annotationPalette } from "../model/annotationPalette";

export function AnnotationColorSelect({ color, onSelectColor }: {
  color: string;
  onSelectColor: (color: string) => void;
}) {
  const { t } = useAppTranslation();
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number; width: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const current = annotationPalette.find((entry) => entry.value === color);
  const label = t("classroom.annotation.colorValue", {
    color: current ? t(`classroom.annotation.colors.${current.name}`) : t("classroom.annotation.currentColor"),
  });

  function closeAndFocus() {
    setPosition(null);
    triggerRef.current?.focus();
  }

  function open() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(224, window.innerWidth - 16);
    const maxHeight = Math.min(408, window.innerHeight - 16);
    setActiveIndex(Math.max(0, annotationPalette.findIndex((entry) => entry.value === color)));
    setPosition({
      width,
      maxHeight,
      left: Math.max(8, Math.min(bounds.right + 8, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(bounds.top, window.innerHeight - maxHeight - 8)),
    });
  }

  useLayoutEffect(() => {
    if (position) listRef.current?.focus();
  }, [position]);

  useEffect(() => {
    if (!position) return;
    listRef.current?.children[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, position]);

  useEffect(() => {
    if (!position) return;
    function outside(event: Event) {
      if (event.target instanceof Node
        && !triggerRef.current?.contains(event.target)
        && !listRef.current?.contains(event.target)) setPosition(null);
    }
    function viewportChanged(event: Event) {
      // Scrolling the options themselves must keep the list open.
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return;
      if (listRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
      setPosition(null);
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    window.addEventListener("resize", viewportChanged);
    window.addEventListener("scroll", viewportChanged, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("resize", viewportChanged);
      window.removeEventListener("scroll", viewportChanged, true);
    };
  }, [position]);

  function choose(value: string) {
    onSelectColor(value);
    closeAndFocus();
  }

  return (
    <div className="playsay-color-select" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className="playsay-annotation-button playsay-color-trigger"
        data-testid="annotation-color-select"
        aria-label={label}
        title={label}
        aria-haspopup="listbox"
        aria-expanded={Boolean(position)}
        aria-controls={position ? id : undefined}
        onClick={() => position ? closeAndFocus() : open()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            open();
          }
        }}
      >
        <span className="playsay-color-sample" style={{ backgroundColor: color }} aria-hidden="true" />
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {position ? createPortal(
        <div
          ref={listRef}
          id={id}
          role="listbox"
          tabIndex={-1}
          aria-label={t("classroom.annotation.color")}
          aria-activedescendant={`${id}-${activeIndex}`}
          className="playsay-color-list"
          style={position}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            const key = event.key;
            if (key === "Tab") {
              closeAndFocus();
              return;
            }
            event.preventDefault();
            if (key === "Escape") closeAndFocus();
            if (key === "Enter" || key === " ") choose(annotationPalette[activeIndex].value);
            if (key === "ArrowDown") setActiveIndex((index) => (index + 1) % annotationPalette.length);
            if (key === "ArrowUp") setActiveIndex((index) => (index + annotationPalette.length - 1) % annotationPalette.length);
            if (key === "Home") setActiveIndex(0);
            if (key === "End") setActiveIndex(annotationPalette.length - 1);
          }}
        >
          {annotationPalette.map((entry, index) => (
            <div
              key={entry.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={entry.value === color}
              data-active={activeIndex === index ? "true" : "false"}
              className="playsay-color-option"
              onClick={() => choose(entry.value)}
            >
              <span className="playsay-color-sample" style={{ backgroundColor: entry.value }} aria-hidden="true" />
              <span>{t(`classroom.annotation.colors.${entry.name}`)}</span>
              {entry.value === color ? <Check size={16} aria-hidden="true" /> : null}
            </div>
          ))}
        </div>, document.fullscreenElement ?? document.body,
      ) : null}
    </div>
  );
}
