import type { Messages } from "../messages";

/** Spanish text of the gamification area; same shape as the English one. */
export const gamification: Messages["gamification"] = {
  xpKinds: {
    completion: "Resuelto",
    perfect: "Intento perfecto",
    "scheduled-review": "Repaso hecho",
    transfer: "Contexto nuevo",
    "personal-best": "Mejor marca",
    "daily-completion": "Sesión diaria",
  },
  combo: {
    increased: (n) => `Combo ×${n}`,
    kept: (n) => `Combo ×${n} mantenido`,
    notStarted: "Combo sin empezar",
    resetFailed: "Combo reiniciado: un nuevo comienzo",
    resetStrongHint: "Combo reiniciado por una pista fuerte: un nuevo comienzo",
    resetAntiPattern: "Combo reiniciado por un antipatrón: un nuevo comienzo",
  },
  streak: {
    days: (n) => (n === 1 ? "Racha de 1 día" : `Racha de ${n} días`),
    welcomeBack: (longest) =>
      `Te damos la bienvenida de nuevo. Tu racha más larga fue de ${longest} ${longest === 1 ? "día" : "días"}; una nueva empieza con la sesión de hoy.`,
    start: "Termina una sesión para empezar una racha.",
  },
  stats: {
    streakHeading: "Racha",
    thisWeek: "Esta semana",
    today: "Hoy",
    weekdays: ["L", "M", "X", "J", "V", "S", "D"],
    sessionDone: ", sesión hecha",
    margin: "Un día perdido no rompe tu racha: tienes un día de margen.",
    levelLabel: "Tu nivel",
    level: (n) => `Nivel ${n}`,
    xpProgress: (xp, into, needed, next) => `${xp} XP · ${into}/${needed} para el nivel ${next}`,
    levelProgress: (n) => `Progreso del nivel ${n}`,
    xpVsMastery: "El XP mide lo que practicas. El dominio mide lo que de verdad sabes hacer.",
    recentBestHeading: "Mejor marca reciente",
    recentBest: (title, metrics) => `Mejor marca reciente: ${title} (${metrics})`,
    metrics: {
      time: "velocidad",
      efficiency: "eficiencia",
      performance: "puntuación",
      reaction: "tiempo de reacción",
    },
  },
  reward: {
    xp: (n) => `+${n} XP`,
    repeated: " · repetido hoy: reducido",
    capped: " · límite diario de XP alcanzado",
    noXp: "El XP premia los ejercicios resueltos. El dominio es aparte: solo crece con la práctica.",
  },
  ghost: {
    compare: "Comparación con tu mejor intento",
    run: "Intento",
    keys: "Teclas",
    keystrokes: "Pulsaciones",
    time: "Tiempo",
    nothing: "(nada)",
    labels: { YOU: "TÚ", MASTER: "MAESTRO", "YOUR BEST": "TU MEJOR" },
  },
  replay: {
    show: "Repetición",
    hide: "Ocultar repetición",
    label: "Repetición",
    whichRun: "Qué intento repetir",
    sources: { you: "Tu intento", master: "Maestro", best: "Tu mejor" },
    start: (keys) => `Inicio. ${keys} ${keys === 1 ? "tecla" : "teclas"}.`,
    step: (index, last, key, accepted) =>
      `Paso ${index} de ${last}: ${key}${accepted ? "" : " (no aceptada)"}.`,
    modeAndText: (mode, text) => `Modo ${mode}. Texto: ${text}`,
    startButton: "Inicio",
    back: "Volver",
    stepButton: "Paso",
    play: "Reproducir",
    pause: "Pausa",
  },
};
