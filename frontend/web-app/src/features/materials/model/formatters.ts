import type { CourseLessonMap } from "../../../entities/schedule/model";
import type { Course, CourseLesson, LessonMaterialJson, LessonMaterialSubmission } from "../../../shared/api/playsay";
import { parseOptionalNumber } from "../../../shared/utils/number";
import { i18n, supportedLanguages } from "../../../shared/i18n";
import type { MaterialBlockType, MaterialEditorBlock } from "./types";

export const FILL_GAP_MARKER = "␣";

export function uniqueMaterialOptions(options: string[]): string[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = normalizeMaterialAnswer(option);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function uniqueMaterialTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.reduce<string[]>((result, tag) => {
    const normalized = normalizeMaterialTag(tag);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return result;
    }
    seen.add(key);
    return [...result, normalized];
  }, []);
}

export function normalizeMaterialTag(value: string): string {
  return value.trim().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 32);
}

export function normalizeMaterialAnswer(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

export function materialAcceptedAnswersWithCandidate(
  acceptedAnswers: string[],
  primaryAnswer: string | undefined,
  candidate: string,
): string[] {
  const normalizedPrimary = normalizeMaterialAnswer(primaryAnswer);
  return uniqueMaterialOptions([...acceptedAnswers, candidate])
    .filter((answer) => normalizeMaterialAnswer(answer) !== normalizedPrimary);
}

export function materialPromptHasGapMarker(prompt: string): boolean {
  return /(?:␣|___|__|…|\.\.\.)/.test(prompt);
}

export function materialPromptWithGapMarker(prompt: string): string {
  if (materialPromptHasGapMarker(prompt)) {
    return prompt;
  }
  const cleanPrompt = prompt.trimEnd();
  return cleanPrompt ? `${cleanPrompt} ${FILL_GAP_MARKER} ` : `${FILL_GAP_MARKER} `;
}

export function splitFillGapPrompt(prompt: string): { before: string; after: string } {
  const match = prompt.match(/^(.*?)(␣|___|__|…|\.\.\.)(.*)$/);
  if (!match) {
    return { before: prompt, after: "" };
  }

  return {
    before: match[1].trimEnd(),
    after: match[3].trimStart(),
  };
}

export function materialNormalizationTerms(key: "articleContext" | "imageTarget" | "noArticle" | "textTarget"): string[] {
  return supportedLanguages.flatMap((language) => {
    const value = i18n.t(`materials.normalization.${key}`, {
      lng: language,
      returnObjects: true,
    });
    return Array.isArray(value) ? value.map((item) => String(item).toLowerCase()) : [];
  });
}

export function isMaterialNormalizationTerm(key: "imageTarget" | "noArticle" | "textTarget", value: string): boolean {
  return materialNormalizationTerms(key).includes(value.trim().toLowerCase());
}

export function readPromptFromSourceMeta(value: LessonMaterialJson | unknown): string {
  const sourceMeta = asJsonObject(value);
  return asString(sourceMeta.prompt) || asString(sourceMeta.sourceText) || "";
}

export function readUrlFromSourceMeta(value: LessonMaterialJson | unknown): string {
  const sourceMeta = asJsonObject(value);
  return asString(sourceMeta.sourceUrl) || asString(sourceMeta.url) || "";
}

export function flattenCourseLessonMaterialOptions(
  courses: Course[],
  lessons: CourseLessonMap,
): Array<{ key: string; label: string; courseId: string; lesson: CourseLesson }> {
  return courses.flatMap((course) =>
    (lessons[course.id] ?? []).map((lesson) => ({
      key: `${course.id}:${lesson.id}`,
      courseId: course.id,
      lesson,
      label: `${course.title} · ${lesson.orderIndex ?? "?"}. ${lesson.title}${lesson.materialTitle ? ` · ${lesson.materialTitle}` : ""}`,
    })),
  );
}

export function materialBlockLabel(type: MaterialBlockType): string {
  switch (type) {
    case "text":
      return i18n.t("materials.blockTypes.text");
    case "image":
      return i18n.t("materials.blockTypes.image");
    case "generatedImage":
      return i18n.t("materials.blockTypes.generatedImage");
    case "videoEmbed":
      return i18n.t("materials.blockTypes.videoEmbed");
    case "flashcards":
      return i18n.t("materials.blockTypes.flashcards");
    case "fillGaps":
      return i18n.t("materials.blockTypes.fillGaps");
    case "multipleChoice":
      return i18n.t("materials.blockTypes.multipleChoice");
    case "matchingPairs":
      return i18n.t("materials.blockTypes.matchingPairs");
    case "freeWriting":
      return i18n.t("materials.blockTypes.freeWriting");
    case "speakingPrompt":
      return i18n.t("materials.blockTypes.speakingPrompt");
    case "drawingArea":
      return i18n.t("materials.blockTypes.drawingArea");
    default:
      return i18n.t("materials.blockTypes.fallback");
  }
}

export function isObjectiveMaterialBlockType(type: MaterialBlockType): boolean {
  return type === "fillGaps" || type === "multipleChoice" || type === "matchingPairs";
}

export function parseFlashcards(value: string, previousCards: MaterialEditorBlock["cards"] = []): MaterialEditorBlock["cards"] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [front = "", back = "", example = ""] = splitMaterialLine(line, 3);
      return {
        id: previousCards?.[index]?.id ?? createClientId("card"),
        front: front.trim(),
        back: back.trim(),
        example: example.trim() || undefined,
      };
    })
    .filter((card) => card.front || card.back);
}

export function formatFlashcards(cards: MaterialEditorBlock["cards"]): string {
  return (cards ?? [])
    .map((card) => [card.front, card.back, card.example].filter(Boolean).map(escapeMaterialCell).join(" | "))
    .join("\n");
}

export function parseExerciseItems(value: string, type: "fillGaps" | "multipleChoice"): MaterialEditorBlock["items"] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [prompt = "", optionsOrAnswer = "", answer = "", weight = ""] = splitMaterialLine(line, 4);
      const fillGapAcceptedAnswers = splitMaterialList(answer).map((option) => option.trim()).filter(Boolean);
      const secondCellOptions = splitMaterialList(optionsOrAnswer).map((option) => option.trim()).filter(Boolean);
      const fillGapUsesAcceptedAnswers = type === "fillGaps" && answer.includes(",") && secondCellOptions.length <= 1;
      const parsedWeight = parseOptionalNumber(fillGapUsesAcceptedAnswers ? weight : weight);
      if (type === "multipleChoice") {
        return {
          prompt: prompt.trim(),
          options: splitMaterialList(optionsOrAnswer).map((option) => option.trim()).filter(Boolean),
          answer: answer.trim() || undefined,
          weight: parsedWeight && parsedWeight > 0 ? parsedWeight : undefined,
        };
      }

      if (fillGapUsesAcceptedAnswers) {
        return {
          prompt: prompt.trim(),
          answer: optionsOrAnswer.trim() || undefined,
          acceptedAnswers: fillGapAcceptedAnswers,
          weight: parsedWeight && parsedWeight > 0 ? parsedWeight : undefined,
        };
      }

      return {
        prompt: prompt.trim(),
        options: answer ? splitMaterialList(optionsOrAnswer).map((option) => option.trim()).filter(Boolean) : undefined,
        answer: (answer || optionsOrAnswer).trim() || undefined,
        weight: parsedWeight && parsedWeight > 0 ? parsedWeight : undefined,
      };
    })
    .filter((item) => item.prompt);
}

export function formatExerciseItems(items: MaterialEditorBlock["items"], type: "fillGaps" | "multipleChoice"): string {
  return (items ?? [])
    .map((item) => {
      if (type === "multipleChoice") {
        return [item.prompt, formatMaterialList(item.options), item.answer, item.weight].filter(Boolean).map(escapeMaterialCell).join(" | ");
      }

      if (item.acceptedAnswers?.length && !item.options?.length) {
        return [item.prompt, item.answer, formatMaterialList(item.acceptedAnswers), item.weight].filter(Boolean).map(escapeMaterialCell).join(" | ");
      }

      return [item.prompt, formatMaterialList(item.options), item.answer, item.weight].filter(Boolean).map(escapeMaterialCell).join(" | ");
    })
    .join("\n");
}

export function splitMaterialLine(value: string, maxParts: number): string[] {
  const separator = findMaterialSeparator(value);
  const parts: string[] = [];
  let current = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (char === "\\" && (next === "|" || next === ";" || next === "\\")) {
      current += next;
      index += 1;
      continue;
    }
    if (char === separator && parts.length < maxParts - 1) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  parts.push(current);
  return parts;
}

export function splitMaterialList(value?: string): string[] {
  if (!value) {
    return [];
  }
  const parts: string[] = [];
  let current = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (char === "\\" && (next === "," || next === "\\")) {
      current += next;
      index += 1;
      continue;
    }
    if (char === ",") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  parts.push(current);
  return parts;
}

export function formatMaterialList(value?: string[]): string | undefined {
  if (!value?.length) {
    return undefined;
  }
  return value.map(escapeMaterialListItem).join(", ");
}

export function findMaterialSeparator(value: string): "|" | ";" {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && value[index + 1]) {
      index += 1;
      continue;
    }
    if (value[index] === "|") {
      return "|";
    }
  }

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && value[index + 1]) {
      index += 1;
      continue;
    }
    if (value[index] === ";") {
      return ";";
    }
  }

  return "|";
}

export function escapeMaterialCell(value: unknown): string {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

export function escapeMaterialListItem(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,");
}

export function normalizeMaterialBlockType(value: string): MaterialBlockType | null {
  const allowed: MaterialBlockType[] = [
    "text",
    "image",
    "videoEmbed",
    "flashcards",
    "fillGaps",
    "multipleChoice",
    "matchingPairs",
    "freeWriting",
    "speakingPrompt",
    "drawingArea",
    "generatedImage",
  ];

  return allowed.includes(value as MaterialBlockType) ? value as MaterialBlockType : null;
}

export function asJsonObject(value: unknown): LessonMaterialJson {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as LessonMaterialJson;
  }

  return {};
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function asPositiveNumber(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function createClientId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  return `${prefix}-${randomId}`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return i18n.t("materials.fileSize.kb", { value: 0 });
  }
  if (bytes < 1024 * 1024) {
    return i18n.t("materials.fileSize.kb", { value: Math.ceil(bytes / 1024) });
  }
  return i18n.t("materials.fileSize.mb", { value: (bytes / (1024 * 1024)).toFixed(1) });
}

export function materialSubmissionUserLabel(submission: LessonMaterialSubmission): string {
  return submission.userName?.trim() || submission.userSubject?.trim() || i18n.t("materials.submissions.studentFallback");
}

export function averageSubmissionScore(submissions: LessonMaterialSubmission[]): number | null {
  const scores = submissions
    .map((submission) => submission.score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

  if (scores.length === 0) {
    return null;
  }

  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

export function materialSubmissionAssessmentSummary(submission: LessonMaterialSubmission): { hints: number; label: string; retries: number } {
  const assessment = asJsonObject(asJsonObject(submission.content).assessment);
  const items = Array.isArray(assessment.items) ? assessment.items.map(asJsonObject) : [];
  const hints = items.reduce((total, item) => total + (asNumber(item.hintsUsed) ?? 0), 0);
  const retries = items.reduce((total, item) => total + Math.max(0, (asNumber(item.attemptsUsed) ?? 0) - 1), 0);
  const errors = asNumber(assessment.errorsCount) ?? submission.errorsCount ?? 0;
  return {
    hints,
    retries,
    label: i18n.t("materials.submissions.assessmentSummary", { errors, hints, retries }),
  };
}

export function formatMaterialScore(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "10";
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

export function formatSubmissionTime(value: string | null | undefined): string {
  if (!value) {
    return i18n.t("materials.submissions.draft");
  }

  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
