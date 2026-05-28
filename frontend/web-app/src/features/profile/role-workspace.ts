import { BookOpen, GraduationCap, ShieldCheck, type LucideIcon } from "lucide-react";

export type PlaySayRole = "STUDENT" | "TEACHER" | "ADMIN";

export type RoleWorkspace = {
  role: PlaySayRole;
  labelKey: string;
  titleKey: string;
  descriptionKey: string;
  primaryActionKey: string;
  secondaryActionKey: string;
  icon: LucideIcon;
};

const fallbackWorkspace: RoleWorkspace = {
  role: "STUDENT",
  labelKey: "workspace.roles.student.label",
  titleKey: "workspace.roles.student.title",
  descriptionKey: "workspace.roles.student.description",
  primaryActionKey: "workspace.roles.student.primaryAction",
  secondaryActionKey: "workspace.roles.student.secondaryAction",
  icon: GraduationCap,
};

const workspaces: Record<PlaySayRole, RoleWorkspace> = {
  STUDENT: fallbackWorkspace,
  TEACHER: {
    role: "TEACHER",
    labelKey: "workspace.roles.teacher.label",
    titleKey: "workspace.roles.teacher.title",
    descriptionKey: "workspace.roles.teacher.description",
    primaryActionKey: "workspace.roles.teacher.primaryAction",
    secondaryActionKey: "workspace.roles.teacher.secondaryAction",
    icon: BookOpen,
  },
  ADMIN: {
    role: "ADMIN",
    labelKey: "workspace.roles.admin.label",
    titleKey: "workspace.roles.admin.title",
    descriptionKey: "workspace.roles.admin.description",
    primaryActionKey: "workspace.roles.admin.primaryAction",
    secondaryActionKey: "workspace.roles.admin.secondaryAction",
    icon: ShieldCheck,
  },
};

export function getPrimaryRole(roles: string[]): PlaySayRole {
  if (roles.includes("ADMIN")) {
    return "ADMIN";
  }
  if (roles.includes("TEACHER")) {
    return "TEACHER";
  }
  return "STUDENT";
}

export function getRoleWorkspace(roles: string[]): RoleWorkspace {
  return workspaces[getPrimaryRole(roles)] ?? fallbackWorkspace;
}

export function getRoleSummary(roles: string[]): string {
  if (roles.length === 0) {
    return "workspace.roles.unassigned";
  }
  return roles.join(", ");
}
