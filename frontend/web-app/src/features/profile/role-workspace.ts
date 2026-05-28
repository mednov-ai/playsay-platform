import {
  BookOpen,
  GraduationCap,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { ruMessages } from "../../shared/i18n/messages.ru";

export type PlaySayRole = "STUDENT" | "TEACHER" | "ADMIN";

export type RoleWorkspace = {
  role: PlaySayRole;
  label: string;
  title: string;
  description: string;
  primaryAction: string;
  secondaryAction: string;
  icon: LucideIcon;
};

const fallbackWorkspace: RoleWorkspace = {
  role: "STUDENT",
  ...ruMessages.roles.workspaces.student,
  icon: GraduationCap,
};

const workspaces: Record<PlaySayRole, RoleWorkspace> = {
  STUDENT: fallbackWorkspace,
  TEACHER: {
    role: "TEACHER",
    ...ruMessages.roles.workspaces.teacher,
    icon: BookOpen,
  },
  ADMIN: {
    role: "ADMIN",
    ...ruMessages.roles.workspaces.admin,
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
    return ruMessages.roles.unassigned;
  }
  return roles.join(", ");
}
