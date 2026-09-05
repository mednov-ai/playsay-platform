import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignPrimaryTeacher,
  attachStudent,
  createDelegation,
  createUser,
  deleteUser,
  detachStudent,
  fetchAdminUsers,
  fetchDelegations,
  fetchTeacherDirectory,
  fetchTeacherStudents,
  removePrimaryTeacher,
  revokeDelegation,
  updateUserRoles,
  updateStudentLessonTranslationPermission,
  waitForUserDeletion,
  userManagementKeys,
  type CreateDelegationInput,
  type CreateUserInput,
} from "./userManagement";

export function useTeacherManagementData() {
  const queryClient = useQueryClient();
  const students = useQuery({ queryFn: fetchTeacherStudents, queryKey: userManagementKeys.students() });
  const directory = useQuery({ queryFn: fetchTeacherDirectory, queryKey: userManagementKeys.directory() });
  const granted = useQuery({ queryFn: () => fetchDelegations("granted"), queryKey: userManagementKeys.delegations("granted") });
  const received = useQuery({ queryFn: () => fetchDelegations("received"), queryKey: userManagementKeys.delegations("received") });

  const refresh = () => queryClient.invalidateQueries({ queryKey: userManagementKeys.all });
  const attach = useMutation({ mutationFn: attachStudent, onSuccess: refresh });
  const detach = useMutation({ mutationFn: detachStudent, onSuccess: refresh });
  const delegate = useMutation({ mutationFn: (input: CreateDelegationInput) => createDelegation("teacher", input), onSuccess: refresh });
  const revoke = useMutation({ mutationFn: (id: string) => revokeDelegation("teacher", id), onSuccess: refresh });
  const translationPermission = useMutation({
    mutationFn: ({ allowed, subject }: { allowed: boolean; subject: string }) =>
      updateStudentLessonTranslationPermission(subject, allowed),
    onSuccess: refresh,
  });

  return { attach, delegate, detach, directory, granted, received, revoke, students, translationPermission };
}

export function useAdminManagementData(filters: { search: string; role: string; status: string }) {
  const queryClient = useQueryClient();
  const users = useQuery({
    queryFn: () => fetchAdminUsers(filters),
    queryKey: userManagementKeys.adminUsers(filters.search, filters.role, filters.status),
  });
  const students = useQuery({
    queryFn: () => fetchAdminUsers({ role: "STUDENT", search: "", status: "ACTIVE" }),
    queryKey: userManagementKeys.adminUsers("", "STUDENT", "ACTIVE"),
  });
  const directory = useQuery({ queryFn: fetchTeacherDirectory, queryKey: userManagementKeys.directory() });
  const delegations = useQuery({ queryFn: () => fetchDelegations("admin"), queryKey: userManagementKeys.delegations("admin") });
  const refresh = () => queryClient.invalidateQueries({ queryKey: userManagementKeys.all });
  const addUser = useMutation({ mutationFn: (input: CreateUserInput) => createUser(input), onSuccess: refresh });
  const changeRoles = useMutation({
    mutationFn: ({ replacementTeacherSubject, roles, subject }: { subject: string; roles: string[]; replacementTeacherSubject?: string }) =>
      updateUserRoles(subject, roles, replacementTeacherSubject),
    onSuccess: refresh,
  });
  const assignTeacher = useMutation({
    mutationFn: async ({ studentSubject, teacherSubject }: { studentSubject: string; teacherSubject: string }) => {
      if (teacherSubject) {
        await assignPrimaryTeacher(studentSubject, teacherSubject);
      } else {
        await removePrimaryTeacher(studentSubject);
      }
    },
    onSuccess: refresh,
  });
  const removeUser = useMutation({
    mutationFn: async ({ replacementTeacherSubject, subject }: { subject: string; replacementTeacherSubject?: string }) => {
      const operation = await deleteUser(subject, replacementTeacherSubject);
      return waitForUserDeletion(operation);
    },
    onSuccess: refresh,
  });
  const delegate = useMutation({ mutationFn: (input: CreateDelegationInput) => createDelegation("admin", input), onSuccess: refresh });
  const revoke = useMutation({ mutationFn: (id: string) => revokeDelegation("admin", id), onSuccess: refresh });
  const translationPermission = useMutation({
    mutationFn: ({ allowed, subject }: { allowed: boolean; subject: string }) =>
      updateStudentLessonTranslationPermission(subject, allowed),
    onSuccess: refresh,
  });
  return { addUser, assignTeacher, changeRoles, delegate, delegations, directory, removeUser, revoke, students, translationPermission, users };
}
