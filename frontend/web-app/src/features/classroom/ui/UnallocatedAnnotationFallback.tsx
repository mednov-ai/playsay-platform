import { useMemo, useState } from "react";
import { useAppTranslation } from "../../../shared/i18n";
import type { AnnotationContent, AnnotationElement } from "../model/annotation";
import { AnnotationLayer } from "./AnnotationLayer";

// Without the original document, separate its page/anchor coordinate spaces rather than overlaying them.
export function UnallocatedAnnotationFallback({ content }: { content: AnnotationContent }) {
  const { t } = useAppTranslation();
  const groups = useMemo(() => {
    const grouped = new Map<string, AnnotationElement[]>();
    content.elements.forEach((element) => {
      const key = JSON.stringify([element.pageId, element.anchorId ?? null]);
      const existing = grouped.get(key);
      if (existing) existing.push(element);
      else grouped.set(key, [element]);
    });
    return [...grouped.values()];
  }, [content]);
  const [group, setGroup] = useState(0);
  const noop = () => undefined;

  return <div className="grid gap-3">
    <p role="status">{t("classroom.unallocatedAnnotations.backgroundUnavailable")}</p>
    {groups.length > 1 ? <label className="grid gap-1">
      {t("classroom.unallocatedAnnotations.selectGroup")}
      <select className="min-h-11 max-w-full rounded border p-2" value={group} onChange={(event) => setGroup(Number(event.target.value))}>
        {groups.map((_, index) => <option key={index} value={index}>{t("classroom.unallocatedAnnotations.group", { number: index + 1 })}</option>)}
      </select>
    </label> : null}
    {groups.length ? <div className="relative aspect-square w-full overflow-hidden rounded border bg-white">
      <AnnotationLayer editingElementId={null} elements={groups[group] ?? []} onAddMindMapNode={noop} onBegin={noop}
        onDeleteSelected={noop} onDeselect={noop} onEditText={noop} onEnd={noop} onElementSizeChange={noop}
        onFinishTextEditing={noop} onMove={noop} onMoveElement={noop} onMindMapKey={noop} onRedo={noop}
        onResizeElement={noop} onSelectElement={noop} onTextChange={noop} onUndo={noop} readOnly selectedElementId={null} tool="pointer" />
    </div> : <p>{t("classroom.unallocatedAnnotations.noRenderableStrokes")}</p>}
  </div>;
}
