import type { Messages } from "../messages";

/** Spanish text of the onboarding area; same shape as the English one. */
export const onboarding: Messages["onboarding"] = {
  steps: {
    welcome: "Bienvenida",
    keyboard: "Teclado",
    experience: "Experiencia",
    check: "Prueba",
    start: "Punto de partida",
  },
  shell: {
    stepsLabel: "Pasos",
    done: "(hecho)",
    stepOf: (step: number, total: number) => `Paso ${step} de ${total}`,
    eyebrow: "Configuración",
  },
  titles: {
    welcome: "Te damos la bienvenida a Tutor NeoVim",
    layout: "¿Qué teclado usas?",
    experience: "Tu experiencia",
    estimate: "Tu punto de partida",
  },
  layoutLead:
    "Los comandos de Vim son los mismos en todos los teclados. Lo que cambia es dónde están algunas teclas, así que te enseñamos a pulsarlas con el dedo correcto.",
  welcome: {
    intro:
      "Aprenderás Vim practicando: ejercicios cortos en un teclado real, unos minutos al día. Dos preguntas rápidas y una prueba corta fijan por dónde empiezas.",
    local: "Todo se queda en este dispositivo. No necesitas una cuenta.",
    getStarted: "Empezar",
    haveAccount: "Ya tengo una cuenta",
  },
  layout: {
    detectPrompt: "Haz clic aquí y escribe unas comillas dobles:",
    detected: (name: string) => `Detectado: ${name}`,
    notDetected: "No se pudo saber con esa tecla. Elige tu distribución abajo.",
    waiting: "Esperando que pulses una tecla (opcional).",
    legend: "Distribución de teclado",
    names: {
      "us-ansi": "US ANSI",
      "es-iso": "ES ISO (español)",
    },
    options: {
      "es-iso": {
        note: "La distribución española habitual",
        quote: "Shift + 2",
        semicolon: "Shift + ,",
        paren: "Shift + 8",
      },
      "us-ansi": {
        note: "La que suponen la mayoría de tutoriales de Vim",
        quote: "Shift + ' (a la derecha de ;)",
        semicolon: "Una tecla, sin Shift",
        paren: "Shift + 9",
      },
    },
    howYouType: "Cómo se escribe",
    changeLater:
      "Puedes cambiarlo cuando quieras. Aquí no se decide tu nivel: lo mide una prueba de un minuto.",
    back: "Volver",
    next: "Continuar",
  },
  experience: {
    question: "¿Cuánto Vim conoces?",
    levels: {
      never: "Nunca he usado Vim",
      basics: "Conozco lo básico (h j k l, i, Esc)",
      occasional: "Uso Vim de vez en cuando",
      regular: "Uso Vim con regularidad",
    },
    note: "Esto solo decide dónde empieza la prueba corta. Nunca desbloquea nada por sí solo: lo que desbloquea es lo que demuestres en la prueba.",
    back: "Volver",
    startCheck: "Empezar la prueba",
    skipCheck: "Saltar la prueba, empezar desde el principio",
  },
  calibration: {
    seeStart: "Ver tu punto de partida",
    eyebrow: "Prueba rápida",
    progress: (n: number) => `Prueba ${n}`,
    giveUp: "Aún no sé esto",
    next: "Continuar",
  },
  estimate: {
    skipped:
      "Has saltado la prueba, así que empiezas desde el principio. Las primeras sesiones son cortas.",
    fromBeginning:
      "Empezarás desde el principio. Es un punto de partida, no una nota: las habilidades solo se dominan practicando con el tiempo.",
    pastShown:
      "Empezarás más adelante de lo que ya demostraste. Es un punto de partida, no una nota: las habilidades solo se dominan practicando con el tiempo.",
    outcomes: {
      passed: "Resuelto",
      failed: "Todavía no",
      assumed: "Supuesto según lo que resolviste",
      untested: "Sin comprobar",
    },
    topics: {
      "vim.navigation.atomic": "hjkl",
      "vim.mode.insert": "cambio de modo",
      "vim.navigation.words": "movimiento por palabras",
      "vim.operator.delete": "operador",
    },
    start: "Empezar a entrenar",
  },
};
