export const de = {
  common: {
    appName: "Play&Say",
    actions: {
      cancel: "Abbrechen",
      close: "Schließen",
      refresh: "Aktualisieren",
      reset: "Zurücksetzen",
      save: "Speichern",
    },
    status: {
      loading: "Laden...",
      saving: "Speichern...",
      saved: "Gespeichert",
      error: "Fehler",
      unavailable: "Nicht verfügbar",
    },
  },
  auth: {
    login: "Anmelden",
    logout: "Abmelden",
    sessionExpired: "Die Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
  },
  shell: {},
  profile: {},
  workspace: {
    roles: {
      unassigned: "Rolle noch nicht zugewiesen",
      student: {
        label: "Schüler",
        title: "Meine Stunden",
        description: "Hier erscheinen kommende Stunden, Hausaufgaben und der Schnellzugang zum Online-Klassenraum.",
        primaryAction: "Stunde öffnen",
        secondaryAction: "Meine Aufgabe",
      },
      teacher: {
        label: "Lehrkraft",
        title: "Gruppen",
        description: "Arbeitsbereich für Lehrkräfte: Gruppen, Schüler und schneller Zugang zur Stunde.",
        primaryAction: "Gruppe öffnen",
        secondaryAction: "Gruppenaufgabe",
      },
      admin: {
        label: "Administrator",
        title: "Benutzer",
        description: "Admin-Prüfung der Rollen und bekannten App-Profile aus dem temporären Sprint-1-Speicher.",
        primaryAction: "Liste prüfen",
        secondaryAction: "Zugriff einstellen",
      },
    },
  },
  schedule: {},
  courses: {},
  materials: {},
  classroom: {},
  errors: {},
} as const;
