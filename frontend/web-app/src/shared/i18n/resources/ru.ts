export const ru = {
  common: {
    appName: "Play&Say",
    actions: {
      cancel: "Отмена",
      close: "Закрыть",
      refresh: "Обновить",
      reset: "Сбросить",
      save: "Сохранить",
    },
    status: {
      loading: "Загрузка...",
      saving: "Сохранение...",
      saved: "Сохранено",
      error: "Ошибка",
      unavailable: "Недоступно",
    },
  },
  auth: {
    login: "Войти",
    logout: "Выйти",
    sessionExpired: "Сессия истекла. Войдите снова.",
  },
  shell: {},
  profile: {},
  workspace: {
    roles: {
      unassigned: "роль ещё не назначена",
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
  schedule: {},
  courses: {},
  materials: {},
  classroom: {},
  errors: {},
} as const;
