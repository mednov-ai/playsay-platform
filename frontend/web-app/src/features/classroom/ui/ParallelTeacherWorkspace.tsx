import { useState, useSyncExternalStore, type ComponentProps } from "react";
import { Button } from "../../../components/ui/button";
import { useAppTranslation } from "../../../shared/i18n";
import { hasUnconfirmedParallelDrafts, subscribeParallelDrafts } from "../hooks/parallelDraftGuard";
import { StudentLiveWorkspace } from "./StudentLiveWorkspace";
import { ParallelLegacyStudentView } from "./ParallelLegacyStudentView";
import { UnallocatedAnnotationArchive } from "./UnallocatedAnnotationArchive";

export function ParallelTeacherWorkspace({ canViewUnallocated, ...workspace }: ComponentProps<typeof StudentLiveWorkspace> & {
  canViewUnallocated: boolean;
}) {
  const { t } = useAppTranslation();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const hasUnconfirmedDrafts = useSyncExternalStore(subscribeParallelDrafts, hasUnconfirmedParallelDrafts, () => false);

  return <>
    {canViewUnallocated || workspace.studentSubject ? <div className="playsay-lesson-inline-message flex flex-wrap gap-2">
      {canViewUnallocated && !legacyOpen ? <Button className="h-auto min-h-11 whitespace-normal" type="button" variant="outline"
        onClick={() => setArchiveOpen((open) => !open)}>{t(archiveOpen ? "classroom.unallocatedAnnotations.back" : "classroom.unallocatedAnnotations.open")}</Button> : null}
      {workspace.studentSubject && !archiveOpen ? <Button className="h-auto min-h-11 whitespace-normal" type="button" variant="outline"
        onClick={() => setLegacyOpen((open) => !open)}>{t(legacyOpen ? "classroom.parallelLegacy.back" : "classroom.parallelLegacy.open")}</Button> : null}
    </div> : null}
    {(legacyOpen || archiveOpen) && hasUnconfirmedDrafts ? <div className="playsay-lesson-inline-message" role="status">{t("classroom.collaborationRecovery.waitingForSave")}</div> : null}
    <div hidden={legacyOpen || archiveOpen}><StudentLiveWorkspace {...workspace} /></div>
    {legacyOpen && workspace.studentSubject ? <ParallelLegacyStudentView
      lessonId={workspace.lessonId} material={workspace.material} studentSubject={workspace.studentSubject} teacherName={workspace.teacherName}
    /> : null}
    {canViewUnallocated && archiveOpen ? <UnallocatedAnnotationArchive lessonId={workspace.lessonId} materialId={workspace.material.id}
      material={workspace.material} teacherName={workspace.teacherName} /> : null}
  </>;
}
