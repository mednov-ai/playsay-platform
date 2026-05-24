import {
  BookOpen,
  GraduationCap,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

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
  label: "Ученик",
  title: "Мои занятия",
  description: "Здесь появятся ближайшие уроки, домашние задания и быстрый вход в online-класс.",
  primaryAction: "Открыть урок",
  secondaryAction: "Моё задание",
  icon: GraduationCap,
};

const workspaces: Record<PlaySayRole, RoleWorkspace> = {
  STUDENT: fallbackWorkspace,
  TEACHER: {
    role: "TEACHER",
    label: "Преподаватель",
    title: "Группы",
    description: "Каркас рабочего места преподавателя: группы, ученики и быстрый переход к занятию.",
    primaryAction: "Открыть группу",
    secondaryAction: "Задание группе",
    icon: BookOpen,
  },
  ADMIN: {
    role: "ADMIN",
    label: "Администратор",
    title: "Пользователи",
    description: "Admin-only проверка ролей и известных app-профилей из временного Sprint 1 store.",
    primaryAction: "Проверить список",
    secondaryAction: "Настройки доступа",
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
    return "роль ещё не назначена";
  }
  return roles.join(", ");
}
