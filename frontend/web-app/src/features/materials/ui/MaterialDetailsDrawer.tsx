import { X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { FormField } from "../../../shared/ui/FormField";
import { useAppTranslation } from "../../../shared/i18n";
import type { MaterialFormState } from "../model/materialDocument";

export function MaterialDetailsDrawer({
  disabled,
  form,
  onClose,
  onUpdateForm,
  open,
}: {
  disabled: boolean;
  form: MaterialFormState;
  onClose: () => void;
  onUpdateForm: <Key extends keyof MaterialFormState>(field: Key, value: MaterialFormState[Key]) => void;
  open: boolean;
}) {
  const { t } = useAppTranslation();

  if (!open) {
    return null;
  }

  return (
    <div className="playsay-material-details-backdrop" onMouseDown={onClose} role="presentation">
      <aside
        aria-label={t("materials.editor.detailsTitle")}
        aria-modal="true"
        className="playsay-material-details"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="playsay-material-details-head">
          <div>
            <h2>{t("materials.editor.detailsTitle")}</h2>
            <p>{t("materials.editor.detailsSubtitle")}</p>
          </div>
          <Button
            aria-label={t("materials.editor.closeDetails")}
            className="h-9 w-9 px-0"
            onClick={onClose}
            title={t("materials.editor.closeDetails")}
            type="button"
            variant="outline"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="playsay-material-details-fields">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("materials.form.level")}>
              <select
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => onUpdateForm("cefrLevel", event.target.value)}
                value={form.cefrLevel}
              >
                {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </FormField>
            <FormField label={t("materials.form.language")}>
              <input
                className="playsay-input"
                disabled={disabled}
                maxLength={16}
                onChange={(event) => onUpdateForm("language", event.target.value)}
                value={form.language}
              />
            </FormField>
            <FormField label={t("materials.form.visibility")}>
              <select
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => onUpdateForm("visibility", event.target.value as MaterialFormState["visibility"])}
                value={form.visibility}
              >
                <option value="PRIVATE">{t("materials.form.visibilityPrivate")}</option>
                <option value="PUBLIC">{t("materials.form.visibilityPublic")}</option>
              </select>
            </FormField>
            <FormField label={t("materials.form.status")}>
              <select
                className="playsay-input"
                disabled={disabled}
                onChange={(event) => onUpdateForm("status", event.target.value as MaterialFormState["status"])}
                value={form.status}
              >
                <option value="DRAFT">{t("materials.form.statusDraft")}</option>
                <option value="PUBLISHED">{t("materials.form.statusPublished")}</option>
              </select>
            </FormField>
          </div>

          <FormField label={t("materials.form.description")}>
            <textarea
              className="playsay-input min-h-24 resize-y py-3"
              disabled={disabled}
              maxLength={2_000}
              onChange={(event) => onUpdateForm("description", event.target.value)}
              placeholder={t("materials.form.descriptionPlaceholder")}
              value={form.description}
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("materials.form.topicTags")}>
              <input
                className="playsay-input"
                disabled={disabled}
                maxLength={240}
                onChange={(event) => onUpdateForm("topicTags", event.target.value)}
                placeholder={t("materials.form.topicTagsPlaceholder")}
                value={form.topicTags}
              />
            </FormField>
            <FormField label={t("materials.form.skillTags")}>
              <input
                className="playsay-input"
                disabled={disabled}
                maxLength={240}
                onChange={(event) => onUpdateForm("skillTags", event.target.value)}
                placeholder={t("materials.form.skillTagsPlaceholder")}
                value={form.skillTags}
              />
            </FormField>
            <FormField label={t("materials.form.ageBand")}>
              <input
                className="playsay-input"
                disabled={disabled}
                maxLength={40}
                onChange={(event) => onUpdateForm("ageBand", event.target.value)}
                placeholder={t("materials.form.ageBandPlaceholder")}
                value={form.ageBand}
              />
            </FormField>
            <FormField label={t("materials.form.estimatedDuration")}>
              <input
                className="playsay-input"
                disabled={disabled}
                max={480}
                min={1}
                onChange={(event) => onUpdateForm("estimatedDurationMin", event.target.value)}
                placeholder={t("materials.form.durationPlaceholder")}
                type="number"
                value={form.estimatedDurationMin}
              />
            </FormField>
          </div>
        </div>
      </aside>
    </div>
  );
}
