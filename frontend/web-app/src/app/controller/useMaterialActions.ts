import type { Dispatch, SetStateAction } from "react";
import type { CourseLessonMap } from "../../entities/schedule/model";
import {
  archiveMaterial,
  draftMaterial,
  draftMaterialFromUrl,
  editCourseLesson,
  fetchCourseLessons,
  fetchMaterials,
  generateMaterialImages,
  saveMaterial,
  suggestMaterialAcceptedAnswers,
  updateMaterialAsset,
  type CourseLesson,
  type LessonMaterial,
  type LessonMaterialAnswerSuggestions,
  type LessonMaterialAnswerSuggestionsInput,
  type LessonMaterialAsset,
  type LessonMaterialAssetUpdateInput,
  type LessonMaterialDraft,
  type LessonMaterialDraftInput,
  type LessonMaterialGenerateImagesInput,
  type LessonMaterialInput,
  type LessonMaterialUrlDraftInput,
} from "../../shared/api/playsay";
import { useAppTranslation } from "../../shared/i18n";
import type { SessionErrorHandler } from "./types";

export function useMaterialActions({
  applySessionError,
  setCourseLessons,
  setMaterialLoading,
  setMaterialMessage,
  setMaterials,
}: {
  applySessionError: SessionErrorHandler;
  setCourseLessons: Dispatch<SetStateAction<CourseLessonMap>>;
  setMaterialLoading: Dispatch<SetStateAction<boolean>>;
  setMaterialMessage: Dispatch<SetStateAction<string | null>>;
  setMaterials: Dispatch<SetStateAction<LessonMaterial[]>>;
}) {
  const { t } = useAppTranslation();

  async function refreshMaterials() {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      setMaterials(await fetchMaterials());
      setMaterialMessage(t("materials.messages.refreshed"));
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, t("materials.messages.refreshFailed")));
    } finally {
      setMaterialLoading(false);
    }
  }

  async function upsertMaterial(input: LessonMaterialInput, materialId?: string): Promise<LessonMaterial | null> {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      const saved = await saveMaterial(input, materialId);
      setMaterials((current) => {
        const exists = current.some((material) => material.id === saved.id);
        return exists
          ? current.map((material) => (material.id === saved.id ? saved : material))
          : [saved, ...current];
      });
      setMaterialMessage(materialId ? t("materials.messages.saved") : t("materials.messages.created"));
      return saved;
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, t("materials.messages.saveFailed")));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function generateMaterialDraft(input: LessonMaterialDraftInput): Promise<LessonMaterialDraft | null> {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      const draft = await draftMaterial(input);
      setMaterialMessage(t("materials.messages.draftReady"));
      return draft;
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, t("materials.messages.draftFailed")));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function generateMaterialDraftFromUrl(input: LessonMaterialUrlDraftInput): Promise<LessonMaterialDraft | null> {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      const draft = await draftMaterialFromUrl(input);
      setMaterialMessage(t("materials.messages.urlDraftReady"));
      return draft;
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, t("materials.messages.urlDraftFailed")));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function generateImagesForMaterial(
    materialId: string,
    input: LessonMaterialGenerateImagesInput,
  ): Promise<LessonMaterial | null> {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      const material = await generateMaterialImages(materialId, input);
      setMaterials((current) => current.map((item) => (item.id === material.id ? material : item)));
      setMaterialMessage(t("materials.messages.imagesGenerated"));
      return material;
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, t("materials.messages.imagesGenerateFailed")));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function suggestAcceptedAnswersForMaterial(
    materialId: string,
    input: LessonMaterialAnswerSuggestionsInput,
  ): Promise<LessonMaterialAnswerSuggestions | null> {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      const suggestions = await suggestMaterialAcceptedAnswers(materialId, input);
      setMaterialMessage(t("materials.messages.answerSuggestionsReady"));
      return suggestions;
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, t("materials.messages.answerSuggestionsFailed")));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function updateMaterialAssetMetadata(
    materialId: string,
    assetId: string,
    input: LessonMaterialAssetUpdateInput,
  ): Promise<LessonMaterialAsset | null> {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      const asset = await updateMaterialAsset(materialId, assetId, input);
      setMaterialMessage(t("materials.messages.imageTagsUpdated"));
      return asset;
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, t("materials.messages.imageTagsUpdateFailed")));
      return null;
    } finally {
      setMaterialLoading(false);
    }
  }

  async function deleteMaterial(materialId: string) {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      await archiveMaterial(materialId);
      setMaterials((current) => current.filter((material) => material.id !== materialId));
      setMaterialMessage(t("materials.messages.archived"));
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, t("materials.messages.archiveFailed")));
    } finally {
      setMaterialLoading(false);
    }
  }

  async function linkMaterialToCourseLesson(courseId: string, lesson: CourseLesson, materialId: string | null) {
    setMaterialLoading(true);
    setMaterialMessage(null);
    try {
      await editCourseLesson(courseId, lesson.id, {
        title: lesson.title,
        orderIndex: lesson.orderIndex ?? null,
        plannedDurationMin: lesson.plannedDurationMin ?? null,
        materialId,
      });
      const lessons = await fetchCourseLessons(courseId);
      setCourseLessons((current) => ({ ...current, [courseId]: lessons }));
      setMaterialMessage(materialId ? t("materials.messages.linkedToLesson") : t("materials.messages.unlinkedFromLesson"));
    } catch (caught) {
      setMaterialMessage(applySessionError(caught, t("materials.messages.linkFailed")));
    } finally {
      setMaterialLoading(false);
    }
  }

  return {
    deleteMaterial,
    generateImagesForMaterial,
    generateMaterialDraft,
    generateMaterialDraftFromUrl,
    linkMaterialToCourseLesson,
    refreshMaterials,
    suggestAcceptedAnswersForMaterial,
    updateMaterialAssetMetadata,
    upsertMaterial,
  };
}
