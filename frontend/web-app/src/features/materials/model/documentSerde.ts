import type { LessonMaterial, LessonMaterialDraft, LessonMaterialInput, LessonMaterialJson } from "../../../shared/api/playsay";
import { i18n } from "../../../shared/i18n";
import type { MaterialAssessmentPolicy, MaterialEditorBlock, MaterialEditorDocument, MaterialEditorPage, MaterialFormState, MaterialMatchingPair, MaterialMatchingTargetKind, MaterialWordBankOption } from "./types";
import { defaultMaterialDocument } from "./documentFactory";
import { cleanMaterialWordBankOptions, materialCardFromJson, materialItemFromJson, materialWordBankOptionFromJson, normalizeMaterialFillGapMode, normalizeMaterialHintPrefixLength, normalizeMaterialItemHintCount, normalizeMaterialItemMaxAttempts, normalizeMaterialItemMaxErrors } from "./documentItemSerde";
import { cleanMaterialAssessment, defaultObjectiveAssessmentPolicy } from "./scoring";
import { asJsonObject, asNumber, asPositiveNumber, asString, createClientId, isMaterialNormalizationTerm, isObjectiveMaterialBlockType, materialBlockLabel, normalizeMaterialAnswer, normalizeMaterialBlockType, readPromptFromSourceMeta, uniqueMaterialOptions } from "./formatters";
import { normalizeMaterialVideoClip } from "./videoClip";

export function materialToForm(material: LessonMaterial): MaterialFormState {
  const sourceMeta = asJsonObject(material.sourceMeta);

  return {
    id: material.id,
    updatedAt: material.updatedAt,
    title: material.title,
    description: material.description ?? "",
    language: material.language || "en",
    cefrLevel: material.cefrLevel || "A2",
    topicTags: (material.topicTags ?? []).join(", "),
    skillTags: (material.skillTags ?? []).join(", "),
    ageBand: material.ageBand ?? "",
    estimatedDurationMin: material.estimatedDurationMin?.toString() ?? "",
    visibility: material.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
    status: material.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    sourcePrompt: readPromptFromSourceMeta(material.sourceMeta),
    document: editorDocumentFromJson(material.document, material.title),
    scoringRubric: asJsonObject(material.scoringRubric),
    sourceMeta,
  };
}

export function materialDraftToForm(draft: LessonMaterialDraft): MaterialFormState {
  const sourceMeta = asJsonObject(draft.sourceMeta);

  return {
    id: null,
    updatedAt: null,
    title: draft.title,
    description: draft.description ?? "",
    language: draft.language || "en",
    cefrLevel: draft.cefrLevel || "A2",
    topicTags: draft.topicTags?.join(", ") ?? "",
    skillTags: draft.skillTags?.join(", ") ?? "",
    ageBand: draft.ageBand ?? "",
    estimatedDurationMin: draft.estimatedDurationMin?.toString() ?? "",
    visibility: draft.visibility === "PUBLIC" ? "PUBLIC" : "PRIVATE",
    status: draft.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    sourcePrompt: readPromptFromSourceMeta(sourceMeta),
    document: editorDocumentFromJson(draft.document, draft.title),
    scoringRubric: asJsonObject(draft.scoringRubric),
    sourceMeta,
  };
}

export function materialFormToInput(form: MaterialFormState): LessonMaterialInput {
  const title = form.title.trim();
  const sourceMeta = {
    ...asJsonObject(form.sourceMeta),
    prompt: form.sourcePrompt.trim(),
  };

  return {
    title,
    description: form.description.trim() || null,
    language: form.language.trim() || "en",
    cefrLevel: form.cefrLevel,
    topicTags: commaListFromText(form.topicTags),
    skillTags: commaListFromText(form.skillTags),
    ageBand: form.ageBand.trim() || null,
    estimatedDurationMin: optionalPositiveInteger(form.estimatedDurationMin),
    visibility: form.visibility,
    status: form.status,
    document: {
      ...form.document,
      pages: form.document.pages.map((page) => ({
        ...page,
        title: page.title.trim() || title,
        blocks: page.blocks.map((block) => cleanMaterialBlock(block)),
      })),
    } as unknown as LessonMaterialJson,
    sourceMeta,
    scoringRubric: form.scoringRubric,
  };
}

export function materialPreviewFromForm(form: MaterialFormState): LessonMaterial {
  const input = materialFormToInput({
    ...form,
    title: form.title.trim() || i18n.t("materials.defaults.materialTitle"),
  });
  const now = form.updatedAt ?? new Date().toISOString();

  return {
    id: form.id ?? "preview",
    ownerTeacherUserId: null,
    ownerTeacherSubject: null,
    ownerTeacherName: null,
    title: input.title,
    description: input.description ?? null,
    language: input.language ?? "en",
    cefrLevel: input.cefrLevel ?? "A2",
    visibility: input.visibility ?? "PRIVATE",
    status: input.status ?? "DRAFT",
    document: input.document ?? {},
    sourceMeta: input.sourceMeta ?? {},
    scoringRubric: input.scoringRubric ?? {},
    topicTags: input.topicTags ?? [],
    skillTags: input.skillTags ?? [],
    ageBand: input.ageBand ?? null,
    estimatedDurationMin: input.estimatedDurationMin ?? null,
    blockCount: form.document.pages.reduce((count, page) => count + page.blocks.length, 0),
    createdAt: now,
    updatedAt: now,
  };
}

function commaListFromText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function optionalPositiveInteger(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function editorDocumentFromJson(value: LessonMaterialJson | unknown, fallbackTitle = i18n.t("materials.defaults.fallbackTitle")): MaterialEditorDocument {
  const root = asJsonObject(value);
  const rawPages = Array.isArray(root.pages) ? root.pages : [];
  const pages = rawPages
    .map((page, index) => materialPageFromJson(page, index, fallbackTitle))
    .filter((page): page is MaterialEditorPage => page !== null);

  if (pages.length === 0) {
    return defaultMaterialDocument(fallbackTitle);
  }

  return {
    schemaVersion: 1,
    pages,
  };
}

export function materialPageFromJson(value: unknown, index: number, fallbackTitle: string): MaterialEditorPage | null {
  const page = asJsonObject(value);
  const rawBlocks = Array.isArray(page.blocks) ? page.blocks : [];
  const blocks = rawBlocks
    .map((block) => materialBlockFromJson(block))
    .filter((block): block is MaterialEditorBlock => block !== null);

  return {
    id: asString(page.id) || createClientId("page"),
    title: asString(page.title) || (index === 0 ? fallbackTitle : i18n.t("materials.defaults.pageTitleNumber", { number: index + 1 })),
    layout: normalizeMaterialPageLayout(asString(page.layout)),
    blocks,
  };
}

export function materialBlockFromJson(value: unknown): MaterialEditorBlock | null {
  const block = asJsonObject(value);
  const type = normalizeMaterialBlockType(asString(block.type));
  if (!type) {
    return null;
  }

  const result: MaterialEditorBlock = {
    id: asString(block.id) || createClientId("block"),
    type,
    title: asString(block.title) || materialBlockLabel(type),
  };
  const assessment = materialAssessmentFromJson(block.assessment);
  if (assessment || isObjectiveMaterialBlockType(type)) {
    result.assessment = assessment ?? defaultObjectiveAssessmentPolicy();
    if (type === "matchingPairs") {
      const sourceAssessment = asJsonObject(block.assessment);
      const maxErrors = asPositiveNumber(sourceAssessment.maxErrors) ?? asPositiveNumber(sourceAssessment.maxAttempts) ?? 5;
      result.assessment.maxErrors = Math.round(maxErrors);
      result.assessment.maxAttempts = result.assessment.maxErrors;
    }
  }

  const body = asString(block.body);
  const prompt = asString(block.prompt);
  const url = asString(block.url);
  const provider = asString(block.provider);
  const caption = asString(block.caption);
  const alt = asString(block.alt);
  const objectFit = normalizeMaterialObjectFit(asString(block.objectFit));
  const imageSize = normalizeMaterialImageSize(asString(block.imageSize));
  const height = asNumber(block.height);
  const gameIconUrl = asString(block.gameIconUrl);
  const gameSyncCompatibility = normalizeGameSyncCompatibility(asString(block.gameSyncCompatibility));
  const gameAdaptationSourceAssetId = asString(block.gameAdaptationSourceAssetId);
  const gameAdaptationJobId = asString(block.gameAdaptationJobId);
  const gameTitleSource = normalizeGameTitleSource(asString(block.gameTitleSource));
  const externalActivitySupportLevel = normalizeExternalActivitySupportLevel(asString(block.externalActivitySupportLevel));
  const videoClip = normalizeMaterialVideoClip(block.videoClip);

  if (body) {
    result.body = body;
  }
  if (prompt) {
    result.prompt = prompt;
  }
  if (url) {
    result.url = url;
  }
  if (provider) {
    result.provider = provider;
  }
  if (videoClip) {
    result.videoClip = videoClip;
  }
  if (caption) {
    result.caption = caption;
  }
  if (alt) {
    result.alt = alt;
  }
  if (objectFit) {
    result.objectFit = objectFit;
  }
  if (type === "image" || type === "generatedImage") {
    result.imageSize = imageSize;
  }
  if (height !== null) {
    result.height = Math.min(800, Math.max(120, height));
  }
  if (type === "htmlGame") {
    result.gameIconUrl = gameIconUrl || undefined;
    result.gameSyncCompatibility = gameSyncCompatibility;
    result.gameAdaptationSourceAssetId = gameAdaptationSourceAssetId || undefined;
    result.gameAdaptationJobId = gameAdaptationJobId || undefined;
    result.gameTitleSource = gameTitleSource;
  }
  if (type === "externalActivity") {
    result.provider = provider || "EXPERIMENTAL";
    result.externalActivitySupportLevel = externalActivitySupportLevel;
  }

  if (Array.isArray(block.cards)) {
    result.cards = block.cards.map(materialCardFromJson).filter((card): card is NonNullable<MaterialEditorBlock["cards"]>[number] => card !== null);
  }

  if (Array.isArray(block.items)) {
    result.items = block.items.map(materialItemFromJson).filter((item): item is NonNullable<MaterialEditorBlock["items"]>[number] => item !== null);
  }

  if (Array.isArray(block.wordBankOptions)) {
    result.wordBankOptions = block.wordBankOptions
      .map(materialWordBankOptionFromJson)
      .filter((option): option is MaterialWordBankOption => option !== null);
  }

  if (Array.isArray(block.pairs)) {
    result.pairs = block.pairs.map(materialMatchingPairFromJson).filter((pair): pair is MaterialMatchingPair => pair !== null);
  } else if (type === "matchingPairs" && Array.isArray(block.items)) {
    result.pairs = block.items.map(materialMatchingPairFromJson).filter((pair): pair is MaterialMatchingPair => pair !== null);
  }

  return result;
}

export function cleanMaterialBlock(block: MaterialEditorBlock): MaterialEditorBlock {
  const title = block.title.trim() || materialBlockLabel(block.type);
  const clean: MaterialEditorBlock = {
    id: block.id || createClientId("block"),
    type: block.type,
    title,
  };
  if (block.assessment || isObjectiveMaterialBlockType(block.type)) {
    clean.assessment = cleanMaterialAssessment(block.assessment ?? defaultObjectiveAssessmentPolicy());
    if (block.type === "fillGaps") {
      delete clean.assessment.weight;
    }
    if (block.type === "matchingPairs") {
      const maxErrors = block.assessment?.maxErrors ?? block.assessment?.maxAttempts ?? 5;
      clean.assessment.maxErrors = Math.round(Math.min(10, Math.max(1, maxErrors)));
      clean.assessment.maxAttempts = clean.assessment.maxErrors;
    }
  }

  if (block.body?.trim()) {
    clean.body = block.body.trim();
  }
  if (block.prompt?.trim()) {
    clean.prompt = block.prompt.trim();
  }
  if (block.url?.trim()) {
    clean.url = block.url.trim();
  }
  if (block.provider?.trim()) {
    clean.provider = block.provider.trim();
  }
  const videoClip = normalizeMaterialVideoClip(block.videoClip);
  if (videoClip) {
    clean.videoClip = videoClip;
  }
  if (block.caption?.trim()) {
    clean.caption = block.caption.trim();
  }
  if (block.alt?.trim()) {
    clean.alt = block.alt.trim();
  }
  if (block.objectFit === "contain" || block.objectFit === "cover") {
    clean.objectFit = block.objectFit;
  }
  if (block.type === "image" || block.type === "generatedImage") {
    clean.imageSize = normalizeMaterialImageSize(block.imageSize);
  }
  if (block.height) {
    clean.height = Math.min(800, Math.max(120, block.height));
  }
  if (block.type === "htmlGame") {
    if (block.gameIconUrl?.trim()) {
      clean.gameIconUrl = block.gameIconUrl.trim();
    }
    clean.gameTitleSource = normalizeGameTitleSource(block.gameTitleSource) ?? "USER";
    clean.gameSyncCompatibility = normalizeGameSyncCompatibility(block.gameSyncCompatibility);
    if (block.gameAdaptationSourceAssetId?.trim()) {
      clean.gameAdaptationSourceAssetId = block.gameAdaptationSourceAssetId.trim();
    }
    if (block.gameAdaptationJobId?.trim()) {
      clean.gameAdaptationJobId = block.gameAdaptationJobId.trim();
    }
  }
  if (block.type === "externalActivity") {
    clean.provider = block.provider?.trim() || "EXPERIMENTAL";
    clean.externalActivitySupportLevel = normalizeExternalActivitySupportLevel(block.externalActivitySupportLevel) ?? "EXPERIMENTAL";
  }
  if (block.cards?.length) {
    clean.cards = block.cards
      .filter((card) => card.front.trim() || card.back.trim())
      .map((card) => ({
        id: card.id || createClientId("card"),
        front: card.front.trim(),
        back: card.back.trim(),
        example: card.example?.trim() || undefined,
      }));
  }
  const cleanWordBankOptions = cleanMaterialWordBankOptions(block.wordBankOptions ?? []);
  if (cleanWordBankOptions.length) {
    clean.wordBankOptions = cleanWordBankOptions;
  }
  if (block.items?.length) {
    const items = block.items
      .filter((item) => item.prompt.trim())
      .map((item) => ({
        ...item,
        id: item.id?.trim() || createClientId("item"),
      }));
    const itemIds = new Set(items.map((item) => item.id));

    const wordBankOptionIds = new Set(cleanWordBankOptions.map((option) => option.id));
    clean.items = items
      .map((item) => {
        const gapMode = normalizeMaterialFillGapMode(item.gapMode);
        return {
        prompt: item.prompt.trim(),
        id: item.id,
        answer: item.answer?.trim() || undefined,
        answerOptionId: gapMode === "wordBank" &&
          item.answerOptionId &&
          wordBankOptionIds.has(item.answerOptionId)
          ? item.answerOptionId
          : undefined,
        acceptedAnswers: uniqueMaterialOptions(item.acceptedAnswers ?? [])
          .filter((answer) => normalizeMaterialAnswer(answer) !== normalizeMaterialAnswer(item.answer))
          .map((answer) => answer.trim()),
        aiSuggestedAnswers: (item.aiSuggestedAnswers ?? [])
          .filter((suggestion) => suggestion.value.trim())
          .slice(0, 8)
          .map((suggestion) => ({
            value: suggestion.value.trim(),
            reason: suggestion.reason.trim(),
            confidence: Math.min(1, Math.max(0, suggestion.confidence)),
          })),
        baseForm: normalizeMaterialFillGapMode(item.gapMode) === "formTransform"
          ? item.baseForm?.trim() || undefined
          : undefined,
        gapMode: gapMode === "typed" ? undefined : gapMode,
        hintPrefixLength: gapMode === "typed" && normalizeMaterialHintPrefixLength(item.hintPrefixLength)
          ? normalizeMaterialHintPrefixLength(item.hintPrefixLength)
          : undefined,
        hintCount: block.type === "fillGaps" && gapMode === "typed"
          ? normalizeMaterialItemHintCount(item.hintCount)
          : undefined,
        maxAttempts: block.type === "fillGaps" && gapMode !== "singleChoice" && gapMode !== "wordBank"
          ? normalizeMaterialItemMaxAttempts(item.maxAttempts)
          : undefined,
        maxErrors: block.type === "fillGaps" && gapMode === "wordBank"
          ? normalizeMaterialItemMaxErrors(item.maxErrors ?? item.maxAttempts)
          : undefined,
        options: item.options?.map((option) => option.trim()).filter(Boolean),
        threadRootItemId: item.threadRootItemId && item.threadRootItemId !== item.id && itemIds.has(item.threadRootItemId)
          ? item.threadRootItemId
          : undefined,
        weight: block.type === "fillGaps" ? undefined : item.weight && item.weight > 0 ? item.weight : undefined,
        };
      });
  }
  if (block.pairs?.length) {
    clean.pairs = block.pairs
      .filter((pair) => pair.left.trim() && pair.right.trim())
      .map((pair) => {
        const right = pair.right.trim();
        const targetKind = materialMatchingPairTargetKind(pair);
        const cleanPair: MaterialMatchingPair = {
          id: pair.id || createClientId("pair"),
          left: pair.left.trim(),
          right,
          targetKind,
        };
        if (targetKind === "IMAGE") {
          cleanPair.imagePrompt = pair.imagePrompt?.trim() || `child-friendly workbook illustration of ${right}, white background`;
          cleanPair.imageAlt = pair.imageAlt?.trim() || right;
          cleanPair.imageUrl = pair.imageUrl?.trim() || undefined;
        }
        return cleanPair;
      });
  }

  return clean;
}

function normalizeGameSyncCompatibility(
  value: unknown,
): MaterialEditorBlock["gameSyncCompatibility"] {
  return value === "SDK_V1" ||
    value === "LEGACY_PREDICTIVE" ||
    value === "LEGACY_MIRROR" ||
    value === "UNSUPPORTED"
    ? value
    : undefined;
}

function normalizeGameTitleSource(value: string | undefined): MaterialEditorBlock["gameTitleSource"] {
  return value === "FILE" || value === "HTML" || value === "AI" || value === "USER" ? value : undefined;
}

function normalizeExternalActivitySupportLevel(value: string | undefined): MaterialEditorBlock["externalActivitySupportLevel"] {
  return value === "GUARANTEED" || value === "EXPERIMENTAL" ? value : undefined;
}

export function materialAssessmentFromJson(value: unknown): MaterialAssessmentPolicy | undefined {
  const assessment = asJsonObject(value);
  if (Object.keys(assessment).length === 0) {
    return undefined;
  }
  return cleanMaterialAssessment({
    weight: asPositiveNumber(assessment.weight) ?? undefined,
    maxAttempts: asPositiveNumber(assessment.maxAttempts) ?? undefined,
    maxErrors: asPositiveNumber(assessment.maxErrors) ?? undefined,
    attemptPenalty: asNumber(assessment.attemptPenalty) ?? undefined,
    hintCount: asPositiveNumber(assessment.hintCount) ?? undefined,
    hintPenalty: asNumber(assessment.hintPenalty) ?? undefined,
    lockAfterAttempts: typeof assessment.lockAfterAttempts === "boolean" ? assessment.lockAfterAttempts : undefined,
  });
}

export function materialMatchingPairFromJson(value: unknown): MaterialMatchingPair | null {
  const pair = asJsonObject(value);
  const left = asString(pair.left) || asString(pair.word) || asString(pair.prompt);
  const right = asString(pair.right) || asString(pair.target) || asString(pair.answer) || asString(pair.correct) || left;
  if (!left || !right) {
    return null;
  }
  const imagePrompt = asString(pair.imagePrompt) || asString(pair.promptForImage) || asString(pair.generatedImagePrompt) || undefined;
  const imageAlt = asString(pair.imageAlt) || asString(pair.alt) || undefined;
  const imageUrl = asString(pair.imageUrl) || asString(pair.url) || undefined;
  const targetKind = normalizeMatchingTargetKind(asString(pair.targetKind) || asString(pair.kind) || asString(pair.mediaKind)) ??
    (imagePrompt || imageAlt || imageUrl ? "IMAGE" : "TEXT");

  return {
    id: asString(pair.id) || createClientId("pair"),
    left,
    right,
    targetKind,
    imagePrompt: targetKind === "IMAGE" ? imagePrompt : undefined,
    imageAlt: targetKind === "IMAGE" ? imageAlt ?? right : undefined,
    imageUrl: targetKind === "IMAGE" ? imageUrl : undefined,
  };
}

export function materialMatchingPairTargetKind(pair: MaterialMatchingPair): MaterialMatchingTargetKind {
  return pair.targetKind ?? (pair.imagePrompt?.trim() || pair.imageAlt?.trim() || pair.imageUrl?.trim() ? "IMAGE" : "TEXT");
}

function normalizeMaterialPageLayout(value: string): MaterialEditorPage["layout"] {
  const layout = value.trim().toUpperCase();
  if (layout === "WORKSHEET" || layout === "STATIC_IMAGE" || layout === "HTML_GAME") {
    return layout;
  }
  return "FLOW";
}

function normalizeMaterialObjectFit(value: string): MaterialEditorBlock["objectFit"] {
  const fit = value.trim().toLowerCase();
  return fit === "contain" || fit === "cover" ? fit : undefined;
}

export function normalizeMaterialImageSize(value: string | undefined): NonNullable<MaterialEditorBlock["imageSize"]> {
  const size = value?.trim().toUpperCase();
  return size === "SMALL" || size === "LARGE" || size === "FULL" ? size : "MEDIUM";
}

export function normalizeMatchingTargetKind(value: string): MaterialMatchingTargetKind | null {
  const clean = value.trim().toLowerCase();
  if (isMaterialNormalizationTerm("imageTarget", clean)) {
    return "IMAGE";
  }
  if (isMaterialNormalizationTerm("textTarget", clean)) {
    return "TEXT";
  }
  return null;
}
