import type { Messages } from "../messages";

/** Spanish text of the app shell; same shape as the English one. */
export const app: Messages["app"] = {
  noExercises: "No se encontraron ejercicios.",
  notices: {
    unreadable:
      "No se pudo leer tu progreso guardado, así que se empezó un perfil nuevo. Los datos antiguos se guardaron como copia de seguridad en este navegador.",
    unsaved:
      "Este navegador no deja que la app guarde. Puedes seguir practicando, pero perderás el progreso al cerrar la pestaña.",
    dismiss: "Cerrar aviso",
  },
  header: {
    navLabel: "Principal",
    today: "Hoy",
    map: "Mapa de habilidades",
    progress: "Progreso",
    settings: "Ajustes",
    xp: (xp: number) => `${xp} XP`,
    account: "Cuenta",
    signIn: "Iniciar sesión",
  },
  errorBoundary: {
    title: "Algo salió mal",
    body: "La app tuvo un problema inesperado. Tu progreso está guardado en este dispositivo y el error se ha comunicado sin ninguno de tus datos.",
    reload: "Recargar",
    backToToday: "Volver a hoy",
  },
};
