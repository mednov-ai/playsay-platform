import { X } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { createVocabularyHomeworkAssignment } from "../../../shared/api/playsay";
import { useAppTranslation } from "../../../shared/i18n";
import { PersonalPracticeComposer } from "./PersonalPracticeComposer";

export function VocabularyPracticeDrawer({
  onClose,
  onCreated,
  open,
  ownerName,
  ownerSubject,
  ownerUsername,
}: {
  onClose: () => void;
  onCreated: () => void;
  open: boolean;
  ownerName: string;
  ownerSubject: string;
  ownerUsername?: string | null;
}) {
  const { t } = useAppTranslation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/35" role="dialog" aria-label={t("vocabulary.practice.builder.title")} aria-modal="true">
      <button aria-label={t("common.actions.close")} className="min-w-0 flex-1 cursor-default" onClick={onClose} type="button" />
      <section className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-[#fffdfa] p-4 shadow-2xl sm:p-6">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">{t("vocabulary.practice.builder.eyebrow")}</p>
            <h2 className="mt-1 text-2xl font-black">{t("vocabulary.practice.builder.title")}</h2>
            <p className="mt-1 font-semibold text-muted-foreground">{ownerName}{ownerUsername ? ` · @${ownerUsername}` : ""}</p>
          </div>
          <Button aria-label={t("common.actions.close")} onClick={onClose} type="button" variant="outline"><X className="h-4 w-4" /></Button>
        </header>
        <PersonalPracticeComposer
          actionLabel={t("vocabulary.practice.builder.publish")}
          delivery="HOMEWORK"
          onPublish={async (preview, settings) => {
            await createVocabularyHomeworkAssignment({
              mode: settings.mode,
              planId: preview.planId,
              planRevision: preview.revision,
              studentSubjects: [ownerSubject],
              title: t("vocabulary.practice.homeworkTitle", { name: ownerName }),
              wordLimit: settings.wordLimit,
            });
            onCreated();
            onClose();
          }}
          owners={[{ name: ownerName, subject: ownerSubject, username: ownerUsername }]}
        />
      </section>
    </div>
  );
}
