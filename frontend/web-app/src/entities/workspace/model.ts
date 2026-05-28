import type { MeProfile } from "../../shared/api/playsay";

export type WorkspaceTab = "schedule" | "materials" | "courses";

export type WorkspaceTabDefinition = {
  id: WorkspaceTab;
  label: string;
  description: string;
};

export function canAssignLessons(profile: MeProfile | null): boolean {
  return profile?.roles.some((role) => role === "TEACHER" || role === "ADMIN") ?? false;
}

export function workspaceTabsForProfile(profile: MeProfile | null): WorkspaceTabDefinition[] {
  const canAssign = canAssignLessons(profile);
  const scheduleTab: WorkspaceTabDefinition = {
    id: "schedule",
    label: canAssign ? "Уроки" : "Мои уроки",
    description: canAssign ? "расписание и вход" : "ближайшие занятия",
  };

  if (!canAssign) {
    return [scheduleTab];
  }

  return [
    scheduleTab,
    { id: "materials", label: "Материалы", description: "конструктор уроков" },
    { id: "courses", label: "Курсы", description: "программы и шаблоны" },
  ];
}
