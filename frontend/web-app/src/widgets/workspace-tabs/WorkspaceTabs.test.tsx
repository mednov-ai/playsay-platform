import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceTabs } from "./WorkspaceTabs";

describe("WorkspaceTabs", () => {
  it("renders stable tab ids for smoke tests independent of translated labels", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceTabs
        activeTab="schedule"
        onSelect={() => undefined}
        tabs={[
          {
            id: "schedule",
            labelKey: "workspace.tabs.schedule.label",
            descriptionKey: "workspace.tabs.schedule.description",
          },
          {
            id: "homework",
            labelKey: "workspace.tabs.homework.label",
            descriptionKey: "workspace.tabs.homework.description",
          },
        ]}
      />,
    );

    expect(markup).toContain('data-tab-id="schedule"');
    expect(markup).toContain('data-tab-id="homework"');
  });
});
