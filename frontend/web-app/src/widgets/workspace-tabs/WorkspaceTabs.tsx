import { BookOpen, CalendarDays, ClipboardList, Layers3 } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceTab, WorkspaceTabDefinition } from "../../entities/workspace/model";
import { useAppTranslation } from "../../shared/i18n";

export function WorkspaceTabs({
  activeTab,
  onSelect,
  tabs,
}: {
  activeTab: WorkspaceTab;
  onSelect: (tab: WorkspaceTab) => void;
  tabs: WorkspaceTabDefinition[];
}) {
  const { t } = useAppTranslation();

  return (
    <nav className="playsay-workspace-tabs" aria-label={t("workspace.tabs.aria")}>
      {tabs.map((tab) => (
        <button
          className="playsay-workspace-tab"
          data-active={activeTab === tab.id ? "true" : "false"}
          data-tab-id={tab.id}
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          type="button"
        >
          {workspaceTabIcon(tab.id)}
          <span>
            <strong>{t(tab.labelKey)}</strong>
            <small>{t(tab.descriptionKey)}</small>
          </span>
        </button>
      ))}
    </nav>
  );
}

function workspaceTabIcon(tab: WorkspaceTab): ReactNode {
  switch (tab) {
    case "homework":
      return <ClipboardList className="h-4 w-4" />;
    case "materials":
      return <BookOpen className="h-4 w-4" />;
    case "courses":
      return <Layers3 className="h-4 w-4" />;
    case "schedule":
    default:
      return <CalendarDays className="h-4 w-4" />;
  }
}
