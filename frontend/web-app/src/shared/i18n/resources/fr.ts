export const fr = {
  common: {
    appName: "Play&Say",
    actions: {
      cancel: "Annuler",
      close: "Fermer",
      refresh: "Actualiser",
      reset: "Réinitialiser",
      save: "Enregistrer",
    },
    status: {
      loading: "Chargement...",
      saving: "Enregistrement...",
      saved: "Enregistré",
      error: "Erreur",
      unavailable: "Indisponible",
    },
  },
  auth: {
    login: "Se connecter",
    logout: "Se déconnecter",
    sessionExpired: "La session a expiré. Veuillez vous reconnecter.",
  },
  shell: {},
  profile: {},
  workspace: {
    roles: {
      unassigned: "rôle pas encore attribué",
      student: {
        label: "Élève",
        title: "Mes cours",
        description: "Les prochains cours, devoirs et l'accès rapide à la classe en ligne apparaîtront ici.",
        primaryAction: "Ouvrir le cours",
        secondaryAction: "Mon exercice",
      },
      teacher: {
        label: "Professeur",
        title: "Groupes",
        description: "Espace professeur : groupes, élèves et accès rapide au cours.",
        primaryAction: "Ouvrir le groupe",
        secondaryAction: "Exercice du groupe",
      },
      admin: {
        label: "Administrateur",
        title: "Utilisateurs",
        description: "Vérification admin des rôles et profils connus depuis le stockage temporaire du Sprint 1.",
        primaryAction: "Vérifier la liste",
        secondaryAction: "Paramètres d'accès",
      },
    },
  },
  schedule: {},
  courses: {},
  materials: {},
  classroom: {},
  errors: {},
} as const;
