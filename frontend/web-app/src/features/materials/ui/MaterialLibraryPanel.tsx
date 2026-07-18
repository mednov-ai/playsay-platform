import { useEffect, useRef, useState, type ReactNode } from "react";
import { type CourseLessonMap } from "../../../entities/schedule/model";
import {
  fetchMaterialAssets,
  fetchMaterialHtmlGameEnrichment,
  requestMaterialHtmlGameEnrichment,
  uploadMaterialHtmlGameAsset,
  uploadMaterialImageAsset,
  type Course,
  type CourseLesson,
  type LessonMaterial,
  type LessonMaterialAnswerSuggestionsInput,
  type LessonMaterialAnswerSuggestions,
  type LessonMaterialAsset,
  type LessonMaterialAssetUpdateInput,
  type LessonMaterialDraft,
  type LessonMaterialDraftInput,
  type LessonMaterialGenerateImagesInput,
  type LessonMaterialInput,
  type MaterialHtmlGameEnrichment,
  type LessonMaterialUrlDraftInput,
  type MeProfile,
} from "../../../shared/api/playsay";

import {
  MaterialBlockType,
  MaterialDraftSourceImage,
  MaterialEditorBlock,
  MaterialFormState,
  MaterialImageGenerationProgress,
  countPendingMaterialImageTargets,
  defaultMaterialForm,
  duplicateMaterialForm,
  materialDraftToForm,
  materialAssetIdFromUrl,
  materialFormToInput,
  materialFormWithBlockPatch,
  materialPreviewFromForm,
  materialToForm,
  newMaterialBlock,
  prepareMaterialDraftSourceImage,
  readPromptFromSourceMeta,
  readUrlFromSourceMeta,
} from "../model/materialDocument";
import { hasInvalidManualHtmlGameTitle, isEnglishHtmlGameTitle } from "../model/htmlGameTitle";
import { useMaterialAssets } from "../hooks/useMaterialAssets";
import { useMaterialLibraryState } from "../hooks/useMaterialLibraryState";
import { MaterialAccessMessage } from "./MaterialAccessMessage";
import { MaterialBlockPalette } from "./MaterialBlockPalette";
import { MaterialDetailsDrawer } from "./MaterialDetailsDrawer";
import { MaterialDraftPanel } from "./MaterialDraftPanel";
import { MaterialEditorHeader } from "./MaterialEditorHeader";
import { MaterialEditorForm } from "./MaterialEditorForm";
import { MaterialLessonLinkPanel } from "./MaterialLessonLinkPanel";
import { MaterialLibraryHeader } from "./MaterialLibraryHeader";
import { MaterialLibraryList } from "./MaterialLibraryList";
import { MaterialPlayPreviewDialog } from "./MaterialPlayPreviewDialog";
import { MaterialReaderPreview } from "./MaterialReaderPreview";
import { useAppTranslation } from "../../../shared/i18n";

export function MaterialLibraryPanel({
  courses,
  disabled,
  lessons,
  loading,
  materials,
  message,
  onArchive,
  onDraft,
  onDraftFromUrl,
  onGenerateImages,
  onSuggestAcceptedAnswers,
  onUpdateAsset,
  onLinkLesson,
  onRefresh,
  onSave,
  onAuthoringStateChange,
  profile,
  workspaceNavigation,
}: {
  courses: Course[];
  disabled: boolean;
  lessons: CourseLessonMap;
  loading: boolean;
  materials: LessonMaterial[];
  message: string | null;
  onArchive: (materialId: string) => void;
  onDraft: (input: LessonMaterialDraftInput) => Promise<LessonMaterialDraft | null>;
  onDraftFromUrl: (input: LessonMaterialUrlDraftInput) => Promise<LessonMaterialDraft | null>;
  onGenerateImages: (materialId: string, input: LessonMaterialGenerateImagesInput) => Promise<LessonMaterial | null>;
  onSuggestAcceptedAnswers: (materialId: string, input: LessonMaterialAnswerSuggestionsInput) => Promise<LessonMaterialAnswerSuggestions | null>;
  onUpdateAsset: (materialId: string, assetId: string, input: LessonMaterialAssetUpdateInput) => Promise<LessonMaterialAsset | null>;
  onLinkLesson: (courseId: string, lesson: CourseLesson, materialId: string | null) => void;
  onRefresh: () => void;
  onSave: (input: LessonMaterialInput, materialId?: string) => Promise<LessonMaterial | null>;
  onAuthoringStateChange?: (state: { dirty: boolean; focused: boolean }) => void;
  profile: MeProfile | null;
  workspaceNavigation?: ReactNode;
}) {
  const { t } = useAppTranslation();
  const authorShellRef = useRef<HTMLElement>(null);
  const canManage = profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
  const { lessonOptions, selectedLessonKey, setSelectedLessonKey } = useMaterialLibraryState({ courses, lessons });
  const [form, setForm] = useState<MaterialFormState>(() => defaultMaterialForm());
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftImage, setDraftImage] = useState<MaterialDraftSourceImage | null>(null);
  const [draftImageMessage, setDraftImageMessage] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<"library" | "edit" | "preview">("library");
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [savedFormFingerprint, setSavedFormFingerprint] = useState(() => materialFormFingerprint(form));
  const [playPreviewOpen, setPlayPreviewOpen] = useState(false);
  const [imageGenerationProgress, setImageGenerationProgress] = useState<MaterialImageGenerationProgress | null>(null);
  const [assetUploadMessage, setAssetUploadMessage] = useState<string | null>(null);
  const [htmlGameEnrichments, setHtmlGameEnrichments] = useState<Record<string, MaterialHtmlGameEnrichment>>({});
  const enrichmentPollTokensRef = useRef<Record<string, number>>({});
  const mountedRef = useRef(true);
  const formRef = useRef(form);
  const savedFormFingerprintRef = useRef(savedFormFingerprint);
  const { assetLibrary, currentMaterialAssets, syncMaterialAssets } = useMaterialAssets({
    canManage,
    formMaterialId: form.id,
    materials,
  });
  const canGenerateDraft = draftPrompt.trim().length > 0 || draftImage !== null;
  const canGenerateUrlDraft = draftUrl.trim().length > 0;
  const pendingImageTargetsCount = countPendingMaterialImageTargets(form.document, currentMaterialAssets);
  const canGenerateImages = pendingImageTargetsCount > 0;
  const blocks = form.document.pages[0]?.blocks ?? [];
  const hasInvalidGameTitle = hasInvalidManualHtmlGameTitle(form.document);
  const canSave = form.title.trim().length > 0 && blocks.length > 0 && !hasInvalidGameTitle;
  const isDirty = materialFormFingerprint(form) !== savedFormFingerprint;
  const authoringFocused = workspaceMode !== "library";

  formRef.current = form;
  savedFormFingerprintRef.current = savedFormFingerprint;

  useEffect(() => {
    onAuthoringStateChange?.({ dirty: authoringFocused && isDirty, focused: authoringFocused });
  }, [authoringFocused, isDirty, onAuthoringStateChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      onAuthoringStateChange?.({ dirty: false, focused: false });
    };
  }, [onAuthoringStateChange]);

  async function pollHtmlGameEnrichment(materialId: string, assetId: string, blockId: string) {
    const token = (enrichmentPollTokensRef.current[blockId] ?? 0) + 1;
    enrichmentPollTokensRef.current[blockId] = token;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt < 5 ? 2_000 : 5_000));
      if (!mountedRef.current || enrichmentPollTokensRef.current[blockId] !== token) return;
      try {
        const status = await fetchMaterialHtmlGameEnrichment(materialId, assetId, blockId);
        setHtmlGameEnrichments((current) => ({ ...current, [blockId]: status }));
        if (status.status === "READY") {
          const currentForm = formRef.current;
          if (currentForm.id === materialId && status.gameIconUrl) {
            const currentBlock = currentForm.document.pages.flatMap((page) => page.blocks).find((block) => block.id === blockId);
            const nextForm = materialFormWithBlockPatch(currentForm, blockId, {
              gameIconUrl: status.gameIconUrl,
              ...(currentBlock?.gameTitleSource === "USER" ? {} : {
                title: status.title ?? currentBlock?.title,
                gameTitleSource: normalizeGameTitleSource(status.titleSource),
              }),
            });
            const wasClean = materialFormFingerprint(currentForm) === savedFormFingerprintRef.current;
            formRef.current = nextForm;
            setForm(nextForm);
            if (wasClean) {
              const fingerprint = materialFormFingerprint(nextForm);
              savedFormFingerprintRef.current = fingerprint;
              setSavedFormFingerprint(fingerprint);
            }
          }
          const assets = await fetchMaterialAssets(materialId);
          const material = materials.find((item) => item.id === materialId);
          if (material) syncMaterialAssets(material, assets);
          onRefresh();
          return;
        }
        if (status.status === "FAILED") return;
      } catch {
        if (attempt >= 59) return;
      }
    }
  }

  async function startHtmlGameEnrichment(
    materialId: string,
    assetId: string,
    blockId: string,
    preferredTitle?: string,
    regenerateIcon = false,
  ) {
    const status = await requestMaterialHtmlGameEnrichment(materialId, assetId, {
      blockId,
      preferredTitle,
      regenerateIcon,
    });
    setHtmlGameEnrichments((current) => ({ ...current, [blockId]: status }));
    void pollHtmlGameEnrichment(materialId, assetId, blockId);
  }

  function updateForm<Key extends keyof MaterialFormState>(field: Key, value: MaterialFormState[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    const nextForm = defaultMaterialForm();
    setForm(nextForm);
    setSavedFormFingerprint(materialFormFingerprint(nextForm));
    setDraftPrompt("");
    setDraftUrl("");
    setDraftImage(null);
    setDraftImageMessage(null);
    setActiveBlockId(null);
    setDetailsOpen(false);
    setHtmlGameEnrichments({});
    enrichmentPollTokensRef.current = {};
    setWorkspaceMode("edit");
  }

  function selectMaterial(material: LessonMaterial) {
    const nextForm = materialToForm(material);
    setForm(nextForm);
    setSavedFormFingerprint(materialFormFingerprint(nextForm));
    setDraftPrompt(readPromptFromSourceMeta(material.sourceMeta));
    setDraftUrl(readUrlFromSourceMeta(material.sourceMeta));
    setDraftImage(null);
    setDraftImageMessage(null);
    setActiveBlockId(nextForm.document.pages[0]?.blocks[0]?.id ?? null);
    setDetailsOpen(false);
    setHtmlGameEnrichments({});
    enrichmentPollTokensRef.current = {};
    setWorkspaceMode("preview");
  }

  function addBlock(type: MaterialBlockType) {
    const nextBlock = newMaterialBlock(type);
    setWorkspaceMode("edit");
    setForm((current) => ({
      ...current,
      document: {
        ...current.document,
        pages: current.document.pages.map((page, index) => {
          if (index !== 0) {
            return page;
          }
          const activeIndex = page.blocks.findIndex((block) => block.id === activeBlockId);
          const insertionIndex = activeIndex >= 0 ? activeIndex + 1 : page.blocks.length;
          return {
            ...page,
            blocks: [
              ...page.blocks.slice(0, insertionIndex),
              nextBlock,
              ...page.blocks.slice(insertionIndex),
            ],
          };
        }),
      },
    }));
    setActiveBlockId(nextBlock.id);
    setPaletteOpen(false);
  }

  function updateBlock(blockId: string, patch: Partial<MaterialEditorBlock>) {
    setForm((current) => materialFormWithBlockPatch(current, blockId, patch));
  }

  function removeBlock(blockId: string) {
    setForm((current) => ({
      ...current,
      document: {
        ...current.document,
        pages: current.document.pages.map((page) => ({
          ...page,
          blocks: page.blocks.filter((block) => block.id !== blockId),
        })),
      },
    }));
    if (activeBlockId === blockId) {
      const blockIndex = blocks.findIndex((block) => block.id === blockId);
      setActiveBlockId(blocks[blockIndex + 1]?.id ?? blocks[blockIndex - 1]?.id ?? null);
    }
  }

  function moveBlock(blockId: string, direction: -1 | 1) {
    setForm((current) => ({
      ...current,
      document: {
        ...current.document,
        pages: current.document.pages.map((page, pageIndex) => {
          if (pageIndex !== 0) {
            return page;
          }
          const currentIndex = page.blocks.findIndex((block) => block.id === blockId);
          const targetIndex = currentIndex + direction;
          if (currentIndex < 0 || targetIndex < 0 || targetIndex >= page.blocks.length) {
            return page;
          }
          const nextBlocks = [...page.blocks];
          const [movedBlock] = nextBlocks.splice(currentIndex, 1);
          nextBlocks.splice(targetIndex, 0, movedBlock);
          return { ...page, blocks: nextBlocks };
        }),
      },
    }));
    setActiveBlockId(blockId);
  }

  async function saveCurrentMaterial() {
    if (hasInvalidGameTitle) {
      setAssetUploadMessage(t("materials.messages.gameTitleEnglishOnly"));
      return;
    }
    if (!canSave || disabled) {
      return;
    }
    const saved = await saveMaterialAndMaybeGenerate({ generateMissing: true });
    if (saved) {
      const nextForm = materialToForm(saved);
      setForm(nextForm);
      setSavedFormFingerprint(materialFormFingerprint(nextForm));
      setWorkspaceMode("preview");
    }
  }

  async function generateDraft() {
    const prompt = draftPrompt.trim() || t("materials.draft.defaultPrompt");
    const draft = await onDraft({
      title: form.title || null,
      prompt,
      language: form.language,
      cefrLevel: form.cefrLevel,
      sourceImageDataUrl: draftImage?.dataUrl ?? null,
      sourceFileName: draftImage?.fileName ?? null,
    });
    if (draft) {
      const nextForm = materialDraftToForm(draft);
      setForm(nextForm);
      setSavedFormFingerprint("");
      setDraftPrompt(readPromptFromSourceMeta(draft.sourceMeta) || prompt);
      setActiveBlockId(nextForm.document.pages[0]?.blocks[0]?.id ?? null);
      setWorkspaceMode("edit");
    }
  }

  async function generateDraftFromUrl() {
    const url = draftUrl.trim();
    if (!url) {
      return;
    }
    const draft = await onDraftFromUrl({
      url,
      title: form.title || null,
      prompt: draftPrompt.trim() || null,
      language: form.language,
      cefrLevel: form.cefrLevel,
    });
    if (draft) {
      const nextForm = materialDraftToForm(draft);
      setForm(nextForm);
      setSavedFormFingerprint("");
      setDraftPrompt(readPromptFromSourceMeta(draft.sourceMeta));
      setDraftUrl(readUrlFromSourceMeta(draft.sourceMeta) || url);
      setActiveBlockId(nextForm.document.pages[0]?.blocks[0]?.id ?? null);
      setWorkspaceMode("edit");
    }
  }

  async function suggestAcceptedAnswers(blockId: string, itemIds: string[]) {
    if (!form.id) {
      return;
    }
    const result = await onSuggestAcceptedAnswers(form.id, { blockId, itemIds });
    if (!result) {
      return;
    }
    setWorkspaceMode("edit");
    setForm((current) => ({
      ...current,
      document: {
        ...current.document,
        pages: current.document.pages.map((page) => ({
          ...page,
          blocks: page.blocks.map((block) => {
            if (block.id !== result.blockId || !block.items?.length) {
              return block;
            }
            return {
              ...block,
              items: block.items.map((item, index) => {
                const itemId = item.id?.trim() || `${item.prompt}-${index}`;
                const suggested = result.items.find((suggestionItem) => suggestionItem.itemId === itemId);
                if (!suggested) {
                  return item;
                }
                const existingValues = new Set([
                  item.answer?.trim().toLowerCase(),
                  ...(item.acceptedAnswers ?? []).map((answer) => answer.trim().toLowerCase()),
                ].filter(Boolean));
                const aiSuggestedAnswers = [
                  ...(item.aiSuggestedAnswers ?? []),
                  ...suggested.suggestions.filter((suggestion) => !existingValues.has(suggestion.value.trim().toLowerCase())),
                ];
                return {
                  ...item,
                  aiSuggestedAnswers: aiSuggestedAnswers.filter((suggestion, suggestionIndex, allSuggestions) => (
                    suggestion.value.trim() &&
                    allSuggestions.findIndex((candidate) => candidate.value.trim().toLowerCase() === suggestion.value.trim().toLowerCase()) === suggestionIndex
                  )),
                };
              }),
            };
          }),
        })),
      },
    }));
  }

  async function handleDraftImageChange(file: File | null) {
    setDraftImageMessage(null);
    if (!file) {
      return;
    }

    try {
      const image = await prepareMaterialDraftSourceImage(file);
      setDraftImage(image);
      if (draftPrompt.trim().length === 0) {
        setDraftPrompt(t("materials.draft.defaultScanPrompt"));
      }
    } catch (caught) {
      setDraftImage(null);
      setDraftImageMessage(caught instanceof Error ? caught.message : t("materials.draft.imagePrepareFailed"));
    }
  }

  function linkSelectedLesson() {
    const option = lessonOptions.find((item) => item.key === selectedLessonKey);
    if (!option) {
      return;
    }
    onLinkLesson(option.courseId, option.lesson, form.id);
  }

  function duplicateCurrentMaterial() {
    const nextForm = duplicateMaterialForm(form);
    setForm(nextForm);
    setSavedFormFingerprint("");
    setActiveBlockId(nextForm.document.pages[0]?.blocks[0]?.id ?? null);
    setWorkspaceMode("edit");
  }

  async function saveMaterialAndMaybeGenerate({
    generateMissing = false,
  }: {
    generateMissing?: boolean;
  } = {}): Promise<LessonMaterial | null> {
    const saved = await onSave(materialFormToInput(form), form.id ?? undefined);
    if (!saved) {
      return null;
    }
    if (!generateMissing) {
      return saved;
    }

    let currentMaterial = saved;
    let currentAssets: LessonMaterialAsset[] = [];
    try {
      currentAssets = await fetchMaterialAssets(saved.id);
      syncMaterialAssets(saved, currentAssets);
    } catch {
      currentAssets = [];
    }
    const targetCount = countPendingMaterialImageTargets(materialToForm(currentMaterial).document, currentAssets);
    if (targetCount === 0) {
      return saved;
    }

    try {
      for (let index = 1; index <= targetCount; index += 1) {
        setImageGenerationProgress({ current: index, label: t("materials.progress.generatingImages"), total: targetCount });
        const generated = await onGenerateImages(currentMaterial.id, { maxImages: 1 });
        if (!generated) {
          return currentMaterial;
        }
        currentMaterial = generated;
        setForm(materialToForm(generated));
        try {
          currentAssets = await fetchMaterialAssets(generated.id);
          syncMaterialAssets(generated, currentAssets);
        } catch {
          currentAssets = [];
        }
        const remaining = countPendingMaterialImageTargets(materialToForm(generated).document, currentAssets);
        if (remaining === 0) {
          break;
        }
      }
      return currentMaterial;
    } finally {
      setImageGenerationProgress(null);
    }
  }

  async function generateCurrentImages() {
    const saved = await saveMaterialAndMaybeGenerate({ generateMissing: true });
    if (saved) {
      const nextForm = materialToForm(saved);
      setForm(nextForm);
      setSavedFormFingerprint(materialFormFingerprint(nextForm));
      setWorkspaceMode("preview");
    }
  }

  function updateMaterialBlock(blockId: string, patch: Partial<MaterialEditorBlock>) {
    updateBlock(blockId, patch);
  }

  async function updatePreviewAssetTags(assetId: string, tags: string[]): Promise<LessonMaterialAsset | null> {
    if (!form.id) {
      return null;
    }
    return onUpdateAsset(form.id, assetId, { tags });
  }

  async function persistMaterialBlockPatch(blockId: string, patch: Partial<MaterialEditorBlock>) {
    const nextForm = materialFormWithBlockPatch(form, blockId, patch);
    setForm(nextForm);
    const saved = await onSave(materialFormToInput(nextForm), nextForm.id ?? undefined);
    if (saved) {
      const savedForm = materialToForm(saved);
      setForm(savedForm);
      setSavedFormFingerprint(materialFormFingerprint(savedForm));
    }
  }

  async function uploadBlockAsset(blockId: string, kind: "image" | "htmlGame", file: File) {
    setAssetUploadMessage(null);
    const fallbackTitle = file.name.replace(/\.[^.]+$/, "").trim() || t("materials.defaults.materialTitle");
    let workingForm = form.title.trim() ? form : { ...form, title: fallbackTitle };
    let materialId = workingForm.id;
    if (!materialId) {
      const saved = await onSave(materialFormToInput(workingForm));
      if (!saved) {
        setAssetUploadMessage(t("materials.messages.assetUploadFailed"));
        return;
      }
      workingForm = materialToForm(saved);
      materialId = saved.id;
      setForm(workingForm);
      setSavedFormFingerprint(materialFormFingerprint(workingForm));
    }

    try {
      const asset = kind === "image"
        ? await uploadMaterialImageAsset(materialId, file)
        : await uploadMaterialHtmlGameAsset(materialId, file);
      const gameTitle = typeof asset.metadata.gameTitle === "string" ? asset.metadata.gameTitle.trim() : fallbackTitle;
      const gameTitleSource = normalizeGameTitleSource(typeof asset.metadata.gameTitleSource === "string" ? asset.metadata.gameTitleSource : undefined);
      const nextForm = materialFormWithBlockPatch(workingForm, blockId, {
        url: `material-asset:${asset.id}`,
        ...(kind === "image"
          ? { alt: fallbackTitle, imageSize: workingForm.document.pages.flatMap((page) => page.blocks).find((block) => block.id === blockId)?.imageSize ?? "MEDIUM" }
          : { height: 640, title: gameTitle || fallbackTitle, gameTitleSource: gameTitleSource ?? "FILE" }),
      });
      const saved = await onSave(materialFormToInput(nextForm), materialId);
      if (!saved) {
        setForm(nextForm);
        setAssetUploadMessage(t("materials.messages.assetLinkSaveFailed"));
        return;
      }
      const savedForm = materialToForm(saved);
      setForm(savedForm);
      setSavedFormFingerprint(materialFormFingerprint(savedForm));
      const assets = await fetchMaterialAssets(materialId);
      syncMaterialAssets(saved, assets);
      if (kind === "htmlGame") {
        try {
          await startHtmlGameEnrichment(materialId, asset.id, blockId);
        } catch {
          setAssetUploadMessage(t("materials.messages.htmlGameUploadedIconFailed"));
          return;
        }
      }
      setAssetUploadMessage(kind === "image" ? t("materials.messages.imageUploaded") : t("materials.messages.htmlGameUploaded"));
    } catch (caught) {
      setAssetUploadMessage(caught instanceof Error ? caught.message : t("materials.messages.assetUploadFailed"));
    }
  }

  async function regenerateHtmlGameIcon(blockId: string) {
    const currentForm = formRef.current;
    const block = currentForm.document.pages.flatMap((page) => page.blocks).find((item) => item.id === blockId);
    const materialId = currentForm.id;
    const assetId = materialAssetIdFromUrl(block?.url);
    if (!block || !materialId || !assetId) return;
    if (!isEnglishHtmlGameTitle(block.title)) {
      setAssetUploadMessage(t("materials.messages.gameTitleEnglishOnly"));
      return;
    }
    const nextForm = materialFormWithBlockPatch(currentForm, blockId, { gameTitleSource: "USER" });
    const saved = await onSave(materialFormToInput(nextForm), materialId);
    if (!saved) {
      setAssetUploadMessage(t("materials.messages.gameIconRegenerationFailed"));
      return;
    }
    const savedForm = materialToForm(saved);
    setForm(savedForm);
    setSavedFormFingerprint(materialFormFingerprint(savedForm));
    try {
      await startHtmlGameEnrichment(materialId, assetId, blockId, block.title, true);
      setAssetUploadMessage(t("materials.messages.gameIconRegenerationStarted"));
    } catch {
      setAssetUploadMessage(t("materials.messages.gameIconRegenerationFailed"));
    }
  }

  function requestPalette() {
    setPaletteOpen(true);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>("[data-material-palette-first='true']")?.focus();
    });
  }

  function backToLibrary() {
    if (isDirty && !window.confirm(t("materials.editor.unsavedConfirm"))) {
      return;
    }
    setDetailsOpen(false);
    setPaletteOpen(false);
    enrichmentPollTokensRef.current = {};
    setWorkspaceMode("library");
  }

  function archiveCurrentMaterial() {
    if (!form.id) {
      return;
    }
    onArchive(form.id);
    setDetailsOpen(false);
    setPaletteOpen(false);
    setWorkspaceMode("library");
  }

  useEffect(() => {
    if (workspaceMode === "library" || !isDirty) {
      return undefined;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, workspaceMode]);

  useEffect(() => {
    if (workspaceMode === "library") {
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      authorShellRef.current?.scrollIntoView?.({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspaceMode]);

  useEffect(() => {
    if (workspaceMode === "library") {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailsOpen(false);
        setPaletteOpen(false);
        return;
      }
      if (event.key.toLowerCase() === "s" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void saveCurrentMaterial();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canSave, disabled, form, workspaceMode]);

  if (!profile) {
    return (
      <section className="rounded-[1.25rem] border border-border bg-white/80 p-4">
        <MaterialLibraryHeader />
        <MaterialAccessMessage message={t("materials.loginRequired")} />
      </section>
    );
  }

  return (
    <section
      className="playsay-material-author-shell rounded-[1.25rem] border border-border bg-white/80"
      data-workspace-mode={workspaceMode}
      ref={authorShellRef}
    >
      <MaterialPlayPreviewDialog
        material={materialPreviewFromForm(form)}
        onClose={() => setPlayPreviewOpen(false)}
        open={playPreviewOpen && Boolean(form.title.trim())}
      />
      {!canManage ? (
        <div className="p-4">
          <MaterialLibraryHeader />
          <MaterialAccessMessage message={t("materials.studentAvailability")} />
        </div>
      ) : workspaceMode === "library" ? (
        <div className="p-4">
          <MaterialLibraryHeader
            disabled={disabled}
            loading={loading}
            onRefresh={onRefresh}
            withBorder
          />
          <div className="playsay-material-library-workspace">
            <MaterialLibraryList
              activeMaterialId={form.id}
              disabled={disabled}
              materials={materials}
              onCreateNew={resetForm}
              onSelectMaterial={selectMaterial}
            />
            <div className="grid content-start gap-3">
              <MaterialDraftPanel
                canGenerateDraft={canGenerateDraft}
                canGenerateUrlDraft={canGenerateUrlDraft}
                disabled={disabled}
                draftImage={draftImage}
                draftImageMessage={draftImageMessage}
                draftPrompt={draftPrompt}
                draftUrl={draftUrl}
                onDraftFromUrl={() => void generateDraftFromUrl()}
                onDraftImageChange={(file) => void handleDraftImageChange(file)}
                onGenerateDraft={() => void generateDraft()}
                onRemoveDraftImage={() => setDraftImage(null)}
                onUpdateDraftPrompt={setDraftPrompt}
                onUpdateDraftUrl={setDraftUrl}
              />
              <MaterialLessonLinkPanel
                disabled={disabled}
                formMaterialId={form.id}
                lessonOptions={lessonOptions}
                onLinkSelectedLesson={linkSelectedLesson}
                onSelectLessonKey={setSelectedLessonKey}
                onUnlinkSelectedLesson={() => {
                  const option = lessonOptions.find((item) => item.key === selectedLessonKey);
                  if (option) {
                    onLinkLesson(option.courseId, option.lesson, null);
                  }
                }}
                selectedLessonKey={selectedLessonKey}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="playsay-material-focused-editor">
          <MaterialEditorHeader
            canGenerateImages={canGenerateImages}
            canSave={canSave}
            disabled={disabled}
            dirty={isDirty}
            hasMaterial={Boolean(form.id)}
            mode={workspaceMode}
            onArchive={archiveCurrentMaterial}
            onBack={backToLibrary}
            onDuplicate={duplicateCurrentMaterial}
            onGenerateImages={() => void generateCurrentImages()}
            onOpenDetails={() => setDetailsOpen(true)}
            onPlay={() => setPlayPreviewOpen(true)}
            onSave={() => void saveCurrentMaterial()}
            onToggleMode={() => setWorkspaceMode((current) => current === "edit" ? "preview" : "edit")}
            onUpdateTitle={(value) => updateForm("title", value)}
            pendingImageTargetsCount={pendingImageTargetsCount}
            title={form.title}
            workspaceNavigation={workspaceNavigation}
          />

          {workspaceMode === "preview" ? (
            <div className="playsay-material-preview-workspace">
              <MaterialReaderPreview
                form={form}
                imageGenerationProgress={imageGenerationProgress}
                message={assetUploadMessage ?? message}
                onBlockPatch={updateMaterialBlock}
                onBlockPatchCommit={(blockId, patch) => void persistMaterialBlockPatch(blockId, patch)}
                onUpdateAssetTags={updatePreviewAssetTags}
              />
            </div>
          ) : (
            <div className="playsay-material-editor-workspace">
              <MaterialBlockPalette
                disabled={disabled}
                mobileOpen={paletteOpen}
                onAddBlock={addBlock}
                onClose={() => setPaletteOpen(false)}
              />
              <div className="grid min-w-0 gap-4">
                <MaterialEditorForm
                  activeBlockId={activeBlockId}
                  assetLibrary={assetLibrary}
                  canSuggestAcceptedAnswers={Boolean(form.id)}
                  disabled={disabled}
                  form={form}
                  imageGenerationProgress={imageGenerationProgress}
                  message={assetUploadMessage ?? message}
                  htmlGameEnrichments={htmlGameEnrichments}
                  onActivateBlock={setActiveBlockId}
                  onMoveBlock={moveBlock}
                  onRegenerateHtmlGameIcon={(blockId) => void regenerateHtmlGameIcon(blockId)}
                  onRemoveBlock={removeBlock}
                  onRequestPalette={requestPalette}
                  onSuggestAcceptedAnswers={(blockId, itemIds) => void suggestAcceptedAnswers(blockId, itemIds)}
                  onUpdateBlock={updateBlock}
                  onUploadBlockAsset={(blockId, kind, file) => uploadBlockAsset(blockId, kind, file)}
                />
              </div>
            </div>
          )}

          <MaterialDetailsDrawer
            disabled={disabled}
            form={form}
            onClose={() => setDetailsOpen(false)}
            onUpdateForm={updateForm}
            open={detailsOpen}
          />
        </div>
      )}
    </section>
  );
}

function normalizeGameTitleSource(value: string | null | undefined): MaterialEditorBlock["gameTitleSource"] {
  return value === "FILE" || value === "HTML" || value === "AI" || value === "USER" ? value : undefined;
}

function materialFormFingerprint(form: MaterialFormState): string {
  return JSON.stringify(materialFormToInput(form));
}
