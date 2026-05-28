import { BookOpen, CalendarDays, Layers3 } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceTab, WorkspaceTabDefinition } from "../../entities/workspace/model";

export function WorkspaceTabs({
  activeTab,
  onSelect,
  tabs,
}: {
  activeTab: WorkspaceTab;
  onSelect: (tab: WorkspaceTab) => void;
  tabs: WorkspaceTabDefinition[];
}) {
  return (
    <nav className="playsay-workspace-tabs" aria-label="Рабочие разделы">
      {tabs.map((tab) => (
        <button
          className="playsay-workspace-tab"
          data-active={activeTab === tab.id ? "true" : "false"}
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          type="button"
        >
          {workspaceTabIcon(tab.id)}
          <span>
            <strong>{tab.label}</strong>
            <small>{tab.description}</small>
          </span>
        </button>
      ))}
    </nav>
  );
}

function workspaceTabIcon(tab: WorkspaceTab): ReactNode {
  switch (tab) {
    case "materials":
      return <BookOpen className="h-4 w-4" />;
    case "courses":
      return <Layers3 className="h-4 w-4" />;
    case "schedule":
    default:
      return <CalendarDays className="h-4 w-4" />;
  }
}
