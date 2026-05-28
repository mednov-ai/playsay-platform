export const ruMessages = {
  roles: {
    unassigned: "роль ещё не назначена",
    workspaces: {
      student: {
        label: "Ученик",
        title: "Мои занятия",
        description: "Здесь появятся ближайшие уроки, домашние задания и быстрый вход в online-класс.",
        primaryAction: "Открыть урок",
        secondaryAction: "Моё задание",
      },
      teacher: {
        label: "Преподаватель",
        title: "Группы",
        description: "Каркас рабочего места преподавателя: группы, ученики и быстрый переход к занятию.",
        primaryAction: "Открыть группу",
        secondaryAction: "Задание группе",
      },
      admin: {
        label: "Администратор",
        title: "Пользователи",
        description: "Admin-only проверка ролей и известных app-профилей из временного Sprint 1 store.",
        primaryAction: "Проверить список",
        secondaryAction: "Настройки доступа",
      },
    },
  },
} as const;
