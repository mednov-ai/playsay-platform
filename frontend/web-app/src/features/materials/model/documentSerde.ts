import type { LessonMaterial, LessonMaterialDraft, LessonMaterialInput, LessonMaterialJson } from "../../../shared/api/playsay";
import { i18n } from "../../../shared/i18n";
import type { MaterialAssessmentPolicy, MaterialEditorBlock, MaterialEditorDocument, MaterialEditorPage, MaterialFormState, MaterialMatchingPair, MaterialMatchingTargetKind } from "./types";
import { defaultMaterialDocument } from "./documentFactory";
import { cleanMaterialAssessment, defaultObjectiveAssessmentPolicy } from "./scoring";
import { asJsonObject, asNumber, asPositiveNumber, asString, createClientId, isMaterialNormalizationTerm, isObjectiveMaterialBlockType, materialBlockLabel, normalizeMaterialAnswer, normalizeMaterialBlockType, readPromptFromSourceMeta, uniqueMaterialOptions } from "./formatters";

export function materialToForm(material: LessonMaterial): MaterialFormState {
  const sourceMeta = asJsonObject(material.sourceMeta);

  return {
    id: material.id,
    updatedAt: material.updatedAt,
    title: material.title,
    description: material.description ?? "",
    language: material.language || "en",
    cefrLevel: material.cefrLevel || "A2",
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
    blockCount: form.document.pages.reduce((count, page) => count + page.blocks.length, 0),
    createdAt: now,
    updatedAt: now,
  };
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
    layout: page.layout === "WORKSHEET" ? "WORKSHEET" : "FLOW",
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
  }

  const body = asString(block.body);
  const prompt = asString(block.prompt);
  const url = asString(block.url);
  const provider = asString(block.provider);
  const caption = asString(block.caption);
  const height = asNumber(block.height);

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
  if (caption) {
    result.caption = caption;
  }
  if (height !== null) {
    result.height = Math.min(800, Math.max(120, height));
  }

  if (Array.isArray(block.cards)) {
    result.cards = block.cards.map(materialCardFromJson).filter((card): card is NonNullable<MaterialEditorBlock["cards"]>[number] => card !== null);
  }

  if (Array.isArray(block.items)) {
    result.items = block.items.map(materialItemFromJson).filter((item): item is NonNullable<MaterialEditorBlock["items"]>[number] => item !== null);
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
  if (block.caption?.trim()) {
    clean.caption = block.caption.trim();
  }
  if (block.height) {
    clean.height = Math.min(800, Math.max(120, block.height));
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
  if (block.items?.length) {
    const items = block.items
      .filter((item) => item.prompt.trim())
      .map((item) => ({
        ...item,
        id: item.id?.trim() || createClientId("item"),
      }));
    const itemIds = new Set(items.map((item) => item.id));

    clean.items = items
      .map((item) => ({
        prompt: item.prompt.trim(),
        id: item.id,
        answer: item.answer?.trim() || undefined,
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
        options: item.options?.map((option) => option.trim()).filter(Boolean),
        threadRootItemId: item.threadRootItemId && item.threadRootItemId !== item.id && itemIds.has(item.threadRootItemId)
          ? item.threadRootItemId
          : undefined,
        weight: item.weight && item.weight > 0 ? item.weight : undefined,
      }));
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

export function materialCardFromJson(value: unknown): NonNullable<MaterialEditorBlock["cards"]>[number] | null {
  const card = asJsonObject(value);
  const front = asString(card.front);
  const back = asString(card.back);
  if (!front && !back) {
    return null;
  }

  return {
    id: asString(card.id) || createClientId("card"),
    front,
    back,
    example: asString(card.example) || undefined,
  };
}

export function materialItemFromJson(value: unknown): NonNullable<MaterialEditorBlock["items"]>[number] | null {
  const item = asJsonObject(value);
  const prompt = asString(item.prompt);
  if (!prompt) {
    return null;
  }
  const options = Array.isArray(item.options) ? item.options.map(asString).filter(Boolean) : [];
  const choices = Array.isArray(item.choices) ? item.choices.map(asString).filter(Boolean) : [];
  const answer = asString(item.answer) || asString(item.correct) || undefined;
  const acceptedAnswers = uniqueMaterialOptions([
    ...(Array.isArray(item.acceptedAnswers) ? item.acceptedAnswers.map(asString) : []),
    ...(Array.isArray(item.variants) ? item.variants.map(asString) : []),
  ]).filter((acceptedAnswer) => normalizeMaterialAnswer(acceptedAnswer) !== normalizeMaterialAnswer(answer));
  const aiSuggestedAnswers = (Array.isArray(item.aiSuggestedAnswers) ? item.aiSuggestedAnswers : [])
    .map((suggestion) => {
      const suggestionObject = asJsonObject(suggestion);
      const value = asString(suggestionObject.value);
      if (!value) {
        return null;
      }
      return {
        value,
        reason: asString(suggestionObject.reason),
        confidence: asNumber(suggestionObject.confidence) ?? 0,
      };
    })
    .filter((suggestion): suggestion is NonNullable<NonNullable<MaterialEditorBlock["items"]>[number]["aiSuggestedAnswers"]>[number] => suggestion !== null);

  return {
    id: asString(item.id) || undefined,
    prompt,
    answer,
    acceptedAnswers,
    aiSuggestedAnswers,
    options: uniqueMaterialOptions([...options, ...choices]),
    threadRootItemId: asString(item.threadRootItemId) || asString(item.continuationOfItemId) || undefined,
    weight: asPositiveNumber(item.weight) ?? asPositiveNumber(asJsonObject(item.assessment).weight) ?? undefined,
  };
}

export function materialAssessmentFromJson(value: unknown): MaterialAssessmentPolicy | undefined {
  const assessment = asJsonObject(value);
  if (Object.keys(assessment).length === 0) {
    return undefined;
  }
  return cleanMaterialAssessment({
    weight: asPositiveNumber(assessment.weight) ?? undefined,
    maxAttempts: asPositiveNumber(assessment.maxAttempts) ?? undefined,
    attemptPenalty: asNumber(assessment.attemptPenalty) ?? undefined,
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
