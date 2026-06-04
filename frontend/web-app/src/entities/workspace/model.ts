import type { MeProfile } from "../../shared/api/playsay";

export type WorkspaceTab = "schedule" | "homework" | "materials" | "courses" | "billing";

export type WorkspaceTabDefinition = {
  id: WorkspaceTab;
  labelKey: string;
  descriptionKey: string;
};

export function canAssignLessons(profile: MeProfile | null): boolean {
  return profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
}

export function workspaceTabsForProfile(profile: MeProfile | null): WorkspaceTabDefinition[] {
  const canAssign = canAssignLessons(profile);
  const scheduleTab: WorkspaceTabDefinition = {
    id: "schedule",
    labelKey: canAssign ? "workspace.tabs.schedule.label" : "workspace.tabs.mySchedule.label",
    descriptionKey: canAssign ? "workspace.tabs.schedule.description" : "workspace.tabs.mySchedule.description",
  };

  if (!canAssign) {
    return [
      scheduleTab,
      {
        id: "homework",
        labelKey: "workspace.tabs.homework.label",
        descriptionKey: "workspace.tabs.homework.description",
      },
    ];
  }

  return [
    scheduleTab,
    {
      id: "homework",
      labelKey: "workspace.tabs.homework.label",
      descriptionKey: "workspace.tabs.homework.description",
    },
    {
      id: "materials",
      labelKey: "workspace.tabs.materials.label",
      descriptionKey: "workspace.tabs.materials.description",
    },
    {
      id: "courses",
      labelKey: "workspace.tabs.courses.label",
      descriptionKey: "workspace.tabs.courses.description",
    },
    {
      id: "billing",
      labelKey: "workspace.tabs.billing.label",
      descriptionKey: "workspace.tabs.billing.description",
    },
  ];
}
