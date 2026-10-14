import {
  ChevronDown,
  FileCode2,
  ImagePlus,
  Loader2,
  Plus,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "../../../components/ui/button";
import type { LessonMaterial, ScheduledLesson } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";

type LessonParticipant = ScheduledLesson["participants"][number];

export function TeacherLessonToolbar({
  activeStudentSubject,
  assigningMaterial,
  canManageMaterial,
  currentMaterialId,
  materials,
  onAssignMaterial,
  onSelectMaterial,
  onSelectStudent,
  onUploadHtmlGamePage,
  onUploadImagePage,
  participants,
  selectedMaterialId,
  uploadingHtmlGamePage,
  uploadingImagePage,
  vocabularyAction,
  activityRailAction,
  compact = false,
}: {
  activeStudentSubject: string | null;
  assigningMaterial: boolean;
  canManageMaterial: boolean;
  currentMaterialId: string | null;
  materials: LessonMaterial[];
  onAssignMaterial: () => void;
  onSelectMaterial: (materialId: string) => void;
  onSelectStudent: (subject: string) => void;
  onUploadHtmlGamePage: (file: File) => void;
  onUploadImagePage: (file: File) => void;
  participants: LessonParticipant[];
  selectedMaterialId: string;
  uploadingHtmlGamePage: boolean;
  uploadingImagePage: boolean;
  vocabularyAction: ReactNode;
  activityRailAction?: ReactNode;
  compact?: boolean;
}) {
  const { t } = useAppTranslation();
  const activeParticipant = participants.find(({ subject }) => subject === activeStudentSubject) ?? participants[0] ?? null;
  const hasTarget = Boolean(activeParticipant);
  const activeParticipantLabel = participantLabel(activeParticipant);
  const assignDisabled = assigningMaterial || selectedMaterialId === (currentMaterialId ?? "");

  return (
    <header
      aria-label={t("classroom.teacherToolbar.aria")}
      className="playsay-workbench-topbar playsay-teacher-toolbar"
      data-can-manage-material={canManageMaterial ? "true" : "false"}
      data-compact={compact ? "true" : "false"}
      data-has-target={hasTarget ? "true" : "false"}
    >
      {activeParticipant ? (
        <div className="playsay-teacher-toolbar-target">
          <UserRound aria-hidden="true" className="h-4 w-4" />
          {participants.length > 1 ? (
            <select
              aria-label={t("classroom.teacherTask.targetLabel")}
              className="playsay-teacher-toolbar-select"
              onChange={(event) => onSelectStudent(event.target.value)}
              title={t("classroom.teacherTask.targetLabel")}
              value={activeParticipant.subject}
            >
              {participants.map((participant) => (
                <option key={participant.subject} value={participant.subject}>
                  {participantLabel(participant)}
                </option>
              ))}
            </select>
          ) : (
            <span className="playsay-teacher-toolbar-student" title={activeParticipantLabel}>
              {activeParticipantLabel}
            </span>
          )}
        </div>
      ) : null}

      {canManageMaterial && !compact ? (
        <div className="playsay-teacher-toolbar-material">
          <select
            aria-label={t("classroom.material.pickerLabel")}
            className="playsay-input playsay-teacher-toolbar-material-select"
            disabled={assigningMaterial || materials.length === 0}
            onChange={(event) => onSelectMaterial(event.target.value)}
            title={t("classroom.material.pickerLabel")}
            value={selectedMaterialId}
          >
            <option value="">{t("classroom.material.pickerEmpty")}</option>
            {materials.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <Button
            className="playsay-teacher-toolbar-assign"
            disabled={assignDisabled}
            onClick={onAssignMaterial}
            type="button"
          >
            {assigningMaterial ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t("classroom.actions.assign")}
          </Button>
        </div>
      ) : null}

      <div className="playsay-teacher-toolbar-actions">
        {vocabularyAction}
        {activityRailAction}
        {canManageMaterial && !compact ? (
          <TeacherAddMaterialMenu
            onUploadHtmlGamePage={onUploadHtmlGamePage}
            onUploadImagePage={onUploadImagePage}
            uploadingHtmlGamePage={uploadingHtmlGamePage}
            uploadingImagePage={uploadingImagePage}
          />
        ) : null}
      </div>
    </header>
  );
}

export function TeacherAddMaterialMenu({
  onUploadHtmlGamePage,
  onUploadImagePage,
  uploadingHtmlGamePage,
  uploadingImagePage,
}: {
  onUploadHtmlGamePage: (file: File) => void;
  onUploadImagePage: (file: File) => void;
  uploadingHtmlGamePage: boolean;
  uploadingImagePage: boolean;
}) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }

    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
    );
    if (items.length === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowUp"
          ? (currentIndex <= 0 ? items.length - 1 : currentIndex - 1)
          : (currentIndex + 1) % items.length;
    items[nextIndex]?.focus();
  }

  function handleFileSelect(
    event: ChangeEvent<HTMLInputElement>,
    upload: (file: File) => void,
  ) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    setOpen(false);
    triggerRef.current?.focus();
    upload(file);
  }

  return (
    <div className="playsay-teacher-add-menu" ref={rootRef}>
      <Button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("classroom.actions.add")}
        className="playsay-teacher-add-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        title={t("classroom.actions.add")}
        type="button"
        variant="outline"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        <span className="playsay-teacher-toolbar-action-label">{t("classroom.actions.add")}</span>
        <ChevronDown aria-hidden="true" className="playsay-teacher-add-chevron h-3.5 w-3.5" />
      </Button>

      {open ? (
        <div
          aria-label={t("classroom.actions.add")}
          className="playsay-teacher-add-popover"
          id={menuId}
          onKeyDown={handleMenuKeyDown}
          role="menu"
        >
          <button
            disabled={uploadingImagePage}
            onClick={() => imageInputRef.current?.click()}
            role="menuitem"
            type="button"
          >
            {uploadingImagePage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {uploadingImagePage ? t("classroom.actions.uploadingImagePage") : t("classroom.actions.addImagePage")}
          </button>
          <button
            disabled={uploadingHtmlGamePage}
            onClick={() => htmlInputRef.current?.click()}
            role="menuitem"
            type="button"
          >
            {uploadingHtmlGamePage ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode2 className="h-4 w-4" />}
            {uploadingHtmlGamePage ? t("classroom.actions.uploadingHtmlGamePage") : t("classroom.actions.addHtmlGamePage")}
          </button>
        </div>
      ) : null}

      <input
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        aria-hidden="true"
        className="sr-only"
        disabled={uploadingImagePage}
        onChange={(event) => handleFileSelect(event, onUploadImagePage)}
        ref={imageInputRef}
        tabIndex={-1}
        type="file"
      />
      <input
        accept="text/html,.html"
        aria-hidden="true"
        className="sr-only"
        disabled={uploadingHtmlGamePage}
        onChange={(event) => handleFileSelect(event, onUploadHtmlGamePage)}
        ref={htmlInputRef}
        tabIndex={-1}
        type="file"
      />
    </div>
  );
}

function participantLabel(participant: LessonParticipant | null): string {
  return participant?.displayName ?? participant?.username ?? participant?.subject ?? "";
}
