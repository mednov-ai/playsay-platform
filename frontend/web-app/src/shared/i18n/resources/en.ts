export const en = {
  common: {
    appName: "Play&Say",
    actions: {
      cancel: "Cancel",
      close: "Close",
      refresh: "Refresh",
      reset: "Reset",
      save: "Save",
    },
    status: {
      loading: "Loading...",
      saving: "Saving...",
      saved: "Saved",
      error: "Error",
      unavailable: "Unavailable",
    },
  },
  auth: {
    login: "Sign in",
    logout: "Sign out",
    sessionExpired: "Your session has expired. Please sign in again.",
  },
  shell: {},
  profile: {},
  workspace: {
    roles: {
      unassigned: "role not assigned yet",
      student: {
        label: "Student",
        title: "My lessons",
        description: "Upcoming lessons, homework, and quick access to the online classroom will appear here.",
        primaryAction: "Open lesson",
        secondaryAction: "My assignment",
      },
      teacher: {
        label: "Teacher",
        title: "Groups",
        description: "Teacher workspace skeleton: groups, students, and quick access to lessons.",
        primaryAction: "Open group",
        secondaryAction: "Group assignment",
      },
      admin: {
        label: "Administrator",
        title: "Users",
        description: "Admin-only role check and known app profiles from the temporary Sprint 1 store.",
        primaryAction: "Check list",
        secondaryAction: "Access settings",
      },
    },
  },
  schedule: {},
  courses: {},
  materials: {},
  classroom: {},
  errors: {},
} as const;
