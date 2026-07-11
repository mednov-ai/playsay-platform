import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import { LessonAssignmentWizard } from "./LessonAssignmentWizard";

describe("LessonAssignmentWizard", () => {
  it("starts with a focused student step and exposes the four-step journey", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <LessonAssignmentWizard
          disabled={false}
          lessonOptions={[]}
          managedStudentMessage={null}
          materials={[]}
          onClose={() => undefined}
          onCreate={async () => null}
          onCreateManagedStudent={async () => null}
          onOpenMaterials={() => undefined}
          onPrepare={() => undefined}
          open
          studentUsers={[]}
        />
      </AppProviders>,
    );

    expect(markup).toContain("Назначить урок");
    expect(markup).toContain("Кого будем учить?");
    expect(markup).toContain("Ученики");
    expect(markup).toContain("Время");
    expect(markup).toContain("Материал");
    expect(markup).toContain("Проверка");
  });
});
