import type { Messages } from "../messages";

/** Spanish text of the account and sync area; same shape as the English one. */
export const cloud: Messages["cloud"] = {
  title: "Cuenta",
  signInTitle: "Iniciar sesión",
  signUpTitle: "Crear una cuenta",
  back: "Volver a hoy",
  defaultName: "Estudiante",
  notConfigured:
    "Las cuentas no están disponibles en esta versión. Tu progreso se guarda en este dispositivo.",
  signedOutLine: "Inicia sesión para conservar tu progreso en todos tus dispositivos.",
  status: {
    "signed-out": "Sin sincronizar",
    idle: "Esperando para sincronizar",
    syncing: "Sincronizando…",
    synced: "Todo está guardado en tu cuenta",
    offline:
      "Sin conexión: el progreso se guarda en este dispositivo y se subirá cuando vuelvas a estar en línea",
    error:
      "No se pudo sincronizar. Tu progreso está a salvo en este dispositivo; se volverá a intentar",
  },
  notices: {
    skipped: (count: number) =>
      count === 1
        ? "No se pudo guardar 1 intento y se omitió."
        : `No se pudieron guardar ${count} intentos y se omitieron.`,
    expired: "Tu sesión caducó. Inicia sesión de nuevo para seguir sincronizando.",
  },
  scope:
    "Tus habilidades, repasos y dominio te siguen con tu cuenta. El XP, la racha y las marcas se quedan por ahora en este dispositivo.",
  syncNow: "Sincronizar ahora",
  signOut: "Cerrar sesión",
  intro:
    "Una cuenta conserva tu progreso en todos tus dispositivos. Puedes seguir practicando sin ella.",
  fields: {
    name: "Nombre",
    email: "Correo electrónico",
    password: "Contraseña",
  },
  signIn: "Iniciar sesión",
  signUp: "Crear cuenta",
  needAccount: "Necesito una cuenta",
  haveAccount: "Ya tengo una cuenta",
  errors: {
    unreachable: "No se pudo conectar con el servicio de inicio de sesión",
    unavailable: "El inicio de sesión aún no está disponible",
    invalidEmail: "Introduce un correo electrónico válido",
    signInFailed: "No se pudo iniciar sesión",
    noSession: "Sesión iniciada, pero no se recibió ninguna sesión",
  },
};
