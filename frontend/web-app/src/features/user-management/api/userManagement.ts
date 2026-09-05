import { authConfig } from "../../../shared/api/auth";
import { apiJson } from "../../../shared/api/http";

export type TeacherDirectoryEntry = {
  subject: string;
  displayName: string;
};

export type UserManagementUser = {
  id: string;
  subject: string;
  username: string | null;
  email: string | null;
  displayName: string | null;
  roles: string[];
  status: "ACTIVE" | "DELETED";
  primaryTeacher: TeacherDirectoryEntry | null;
  activeDelegates: TeacherDirectoryEntry[];
  lessonTranslationAllowed: boolean;
  connectionRoutePreference: "AUTO" | "RF";
};

export type TeacherStudent = {
  student: UserManagementUser;
  access: "PRIMARY_TEACHER" | "ACTIVE_DELEGATE" | "ADMIN";
};

export type TeacherDelegation = {
  id: string;
  primaryTeacher: TeacherDirectoryEntry;
  delegateTeacher: TeacherDirectoryEntry;
  students: UserManagementUser[];
  startsAt: string;
  endsAt: string;
  status: "FUTURE" | "ACTIVE" | "EXPIRED" | "REVOKED";
  createdBySubject: string;
  createdAt: string;
  revokedAt: string | null;
};

export type CreateDelegationInput = {
  primaryTeacherSubject?: string;
  delegateTeacherSubjects: string[];
  studentSubjects: string[];
  startsAt: string;
  endsAt: string;
};

export type CreateUserInput = {
  username: string;
  firstName: string;
  lastName?: string;
  email?: string;
  roles: string[];
  primaryTeacherSubject?: string;
};

export const userManagementKeys = {
  all: ["user-management"] as const,
  adminUsers: (search: string, role: string, status: string) =>
    [...userManagementKeys.all, "admin-users", search, role, status] as const,
  delegations: (scope: "admin" | "granted" | "received") =>
    [...userManagementKeys.all, "delegations", scope] as const,
  directory: () => [...userManagementKeys.all, "directory"] as const,
  students: () => [...userManagementKeys.all, "students"] as const,
};

export function fetchTeacherStudents(): Promise<TeacherStudent[]> {
  return apiJson("/api/teacher/students", { method: "GET" }, authConfig);
}

export function fetchTeacherDirectory(): Promise<TeacherDirectoryEntry[]> {
  return apiJson("/api/teachers/directory", { method: "GET" }, authConfig);
}

export function attachStudent(usernameOrEmail: string): Promise<TeacherStudent> {
  return apiJson(
    "/api/teacher/students/attach",
    { body: JSON.stringify({ usernameOrEmail }), method: "POST" },
    authConfig,
  );
}

export function detachStudent(subject: string): Promise<void> {
  return apiJson(`/api/teacher/students/${encodeURIComponent(subject)}`, { method: "DELETE" }, authConfig, 204);
}

export function updateStudentLessonTranslationPermission(subject: string, allowed: boolean): Promise<TeacherStudent> {
  return apiJson(
    `/api/teacher/students/${encodeURIComponent(subject)}/lesson-translation-permission`,
    { body: JSON.stringify({ allowed }), method: "PUT" },
    authConfig,
  );
}

export function updateStudentConnectionRoute(subject: string, connectionRoutePreference: "AUTO" | "RF"): Promise<void> {
  return apiJson(
    `/api/users/students/${encodeURIComponent(subject)}/connection-route`,
    { body: JSON.stringify({ connectionRoutePreference }), method: "PUT" },
    authConfig,
  ).then(() => undefined);
}

export function fetchDelegations(scope: "admin" | "granted" | "received"): Promise<TeacherDelegation[]> {
  const path = scope === "admin"
    ? "/api/admin/user-management/delegations"
    : `/api/teacher/delegations?direction=${scope}`;
  return apiJson(path, { method: "GET" }, authConfig);
}

export function createDelegation(scope: "admin" | "teacher", input: CreateDelegationInput): Promise<TeacherDelegation[]> {
  const path = scope === "admin" ? "/api/admin/user-management/delegations" : "/api/teacher/delegations";
  return apiJson(path, { body: JSON.stringify(input), method: "POST" }, authConfig, 201);
}

export function revokeDelegation(scope: "admin" | "teacher", id: string): Promise<void> {
  const prefix = scope === "admin" ? "/api/admin/user-management" : "/api/teacher";
  return apiJson(`${prefix}/delegations/${id}`, { method: "DELETE" }, authConfig, 204);
}

export function fetchAdminUsers(filters: { search: string; role: string; status: string }): Promise<UserManagementUser[]> {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("query", filters.search.trim());
  if (filters.role) params.set("role", filters.role);
  if (filters.status) params.set("status", filters.status);
  const query = params.size ? `?${params.toString()}` : "";
  return apiJson(`/api/admin/user-management/users${query}`, { method: "GET" }, authConfig);
}

export function createUser(input: CreateUserInput): Promise<UserManagementUser> {
  return apiJson(
    "/api/admin/user-management/users",
    { body: JSON.stringify(input), method: "POST" },
    authConfig,
    201,
  );
}

export function updateUserRoles(subject: string, roles: string[], replacementTeacherSubject?: string): Promise<UserManagementUser> {
  return apiJson(
    `/api/admin/user-management/users/${encodeURIComponent(subject)}/roles`,
    { body: JSON.stringify({ replacementTeacherSubject, roles }), method: "PUT" },
    authConfig,
  );
}

export function assignPrimaryTeacher(studentSubject: string, teacherSubject: string): Promise<TeacherStudent> {
  return apiJson(
    `/api/admin/user-management/students/${encodeURIComponent(studentSubject)}/teacher`,
    { body: JSON.stringify({ teacherSubject }), method: "PUT" },
    authConfig,
  );
}

export function removePrimaryTeacher(studentSubject: string): Promise<void> {
  return apiJson(
    `/api/admin/user-management/students/${encodeURIComponent(studentSubject)}/teacher`,
    { method: "DELETE" },
    authConfig,
    204,
  );
}

export function deleteUser(subject: string, replacementTeacherSubject?: string): Promise<{ operationId: string }> {
  const params = new URLSearchParams();
  if (replacementTeacherSubject) params.set("replacementTeacherSubject", replacementTeacherSubject);
  const query = params.size ? `?${params.toString()}` : "";
  return apiJson(
    `/api/admin/user-management/users/${encodeURIComponent(subject)}${query}`,
    { method: "DELETE" },
    authConfig,
    202,
  );
}
