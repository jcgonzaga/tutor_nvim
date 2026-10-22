import type { Messages } from "../messages";

/** Texto compartido entre pantallas: vocabulario que debe leerse igual en todas partes. */
export const common: Messages["common"] = {
  appName: "Tutor NeoVim",
  language: {
    label: "Idioma",
    help: "Idioma de la interfaz y de los ejercicios. Puedes cambiarlo cuando quieras.",
  },
  stages: {
    locked: "Bloqueada",
    learning: "Aprendiendo",
    practicing: "Practicando",
    fluent: "Fluida",
    mastered: "Dominada",
  },
  strategies: {
    optimal: "Óptima",
    efficient: "Eficiente",
    valid: "Válida",
    inefficient: "Ineficiente",
    "anti-pattern": "Mal hábito",
    failed: "No resuelto",
  },
  antiPatterns: {
    repeated_x: {
      name: "x repetida",
      explain:
        "Pulsaste x muchas veces seguidas. Para borrar una palabra o una línea usa un operador (dw, dd): un solo comando y un solo paso de deshacer.",
    },
    excessive_hjkl: {
      name: "Demasiadas h j k l",
      explain:
        "Te moviste de una casilla en una casilla. Salta por palabras (w, b, e), a los extremos de la línea (0, $) o a un carácter (f, t): muchas menos teclas.",
    },
    arrow_keys: {
      name: "Teclas de flecha",
      explain:
        "Las flechas funcionan, pero alejan la mano de la fila base. Usa h j k l o, mejor aún, un movimiento que te lleve directo adonde quieres.",
    },
    insert_mode_navigation: {
      name: "Moverse en modo INSERT",
      explain:
        "Moviste el cursor estando en modo INSERT. Pulsa Esc, muévete en modo NORMAL y vuelve a INSERT solo donde necesites escribir.",
    },
    repeated_escape: {
      name: "Esc repetida",
      explain:
        "Una sola Esc basta para volver al modo NORMAL. Pulsarla otra vez no hace nada y gasta pulsaciones.",
    },
    repeated_failed_command: {
      name: "El mismo comando fallido",
      explain:
        "Repetiste el mismo comando después de que fallara. Lee primero el mensaje de error: casi siempre dice qué está mal (un nombre, una ruta, una opción que falta).",
    },
    cd_up_chain: {
      name: "Cadena de cd ..",
      explain:
        "Subiste carpeta por carpeta. Una ruta lo hace de una vez: cd ../.. sube dos niveles, y cd ~ o cd a secas va a tu carpeta personal.",
    },
    rm_rf_wildcard: {
      name: "rm -rf con comodín",
      explain:
        "rm -rf con un comodín borra sin preguntar y no se puede deshacer. Nombra exactamente lo que quieres borrar y usa ls antes para comprobarlo.",
    },
  },
  exerciseModes: {
    learn: "Descubrir",
    imitate: "Imitar",
    recall: "Recordar",
    discriminate: "Discriminar",
    transfer: "Transferir",
    rush: "Contrarreloj",
    mission: "Misión",
  },
  sessionBlocks: {
    warmup: "Calentamiento",
    review: "Repaso",
    learn: "Aprender",
    mixed: "Mezcla",
    challenge: "Desafío",
  },
  domains: {
    linux: "Linux",
    vim: "Vim",
    neovim: "Neovim",
    lazyvim: "LazyVim",
  },
  time: {
    now: "ahora",
    inMinutes: (n: number) => `en ${n} ${n === 1 ? "minuto" : "minutos"}`,
    inHours: (n: number) => `en ${n} ${n === 1 ? "hora" : "horas"}`,
    inDays: (n: number) => `en ${n} ${n === 1 ? "día" : "días"}`,
  },
  recommendation: {
    reviewDue: (count: number, shown: string, more: number) =>
      `${count} ${count === 1 ? "habilidad" : "habilidades"} por repasar: ${shown}${more > 0 ? ` y ${more} más` : ""}.`,
    learn: (title: string) => `Próxima habilidad nueva: ${title}.`,
    nextReview: (title: string, when: string) => `Próximo repaso: ${title} ${when}.`,
    allCaughtUp: "Estás al día.",
  },
};
