import {
  fetchMaterial,
  uploadMaterialDocument,
  type LessonMaterial,
  type LessonMaterialInput,
} from "../../../shared/api/playsay";
import {
  defaultMaterialForm,
  materialFormToInput,
  materialFormWithBlockPatch,
  materialToForm,
  newMaterialBlock,
} from "./materialDocument";

export type PendingDocumentMaterialUpload = {
  blockId: string;
  fileFingerprint: string;
  idempotencyKey: string;
  materialId: string;
};

export async function createReadyDocumentMaterial({
  file,
  onPending,
  pending,
  save,
  titleFallback,
}: {
  file: File;
  onPending: (pending: PendingDocumentMaterialUpload) => void;
  pending: PendingDocumentMaterialUpload | null;
  save: (input: LessonMaterialInput, materialId?: string) => Promise<LessonMaterial | null>;
  titleFallback: string;
}): Promise<LessonMaterial> {
  const title = file.name.replace(/\.(pdf|pptx)$/i, "").trim() || titleFallback;
  const block = newMaterialBlock("document");
  const draft = defaultMaterialForm();
  draft.title = title;
  draft.document.pages[0] = {
    ...draft.document.pages[0],
    title,
    layout: "DOCUMENT",
    blocks: [block],
  };
  const created = pending
    ? await fetchMaterial(pending.materialId)
    : await save(materialFormToInput(draft));
  if (!created) throw new Error("MATERIAL_DOCUMENT_CREATE_FAILED");

  const uploadBlockId = pending?.blockId ?? block.id;
  const nextPending = pending ?? {
    blockId: uploadBlockId,
    fileFingerprint: documentFileFingerprint(file),
    idempotencyKey: crypto.randomUUID(),
    materialId: created.id,
  };
  onPending(nextPending);
  const upload = await uploadMaterialDocument(created.id, file, nextPending.idempotencyKey);
  if (upload.status !== "READY" || !upload.displayAsset || !upload.revision) {
    throw new Error(upload.errorCode || "MATERIAL_DOCUMENT_UPLOAD_FAILED");
  }

  const linked = materialFormWithBlockPatch(materialToForm(created), uploadBlockId, {
    documentAssetId: upload.displayAsset.id,
    documentFormat: upload.format === "PPTX" ? "PPTX" : "PDF",
    documentRevision: upload.revision,
    documentPages: upload.pageManifest,
    documentPdfLayout: "SINGLE",
    documentPdfSeparateCover: true,
  });
  const saved = await save(materialFormToInput(linked), created.id);
  if (!saved) throw new Error("MATERIAL_DOCUMENT_LINK_FAILED");
  return saved;
}

export function documentFileFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
