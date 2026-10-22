import type { Messages } from "../messages";

/** Spanish text of the home area; same shape as the English one. */
export const home: Messages["home"] = {
  session: {
    readyTitle: "Tu sesión de hoy está lista",
    continueLabel: "Continuar entrenando",
    readyDetail: "Una sesión corta con lo que toca repasar y lo siguiente.",
    resumeTitle: "Sigue donde lo dejaste",
    inProgress: (done, total) => `Sesión en curso: ${done} de ${total} hechos.`,
    doneTitle: "La sesión de hoy está hecha",
    moreLabel: "Entrenar más",
    doneDetail: "La sesión de hoy está hecha. Otra es opcional.",
    daily: "Sesión diaria",
    practiceSkill: "O practica una habilidad concreta",
  },
  progressAria: "Tu progreso",
  mastery: {
    title: "Dominio",
    summary: (total) => `de ${total} habilidades dominadas`,
  },
  reviews: {
    title: "Repasos programados",
    subtitle: "Vuelven justo antes de que se te olviden",
    empty: "Aún no hay nada programado. Los repasos aparecen cuando practicas una habilidad.",
    buckets: {
      today: "Hoy",
      tomorrow: "Mañana",
      week: "Esta semana",
      later: "Más adelante",
    },
  },
  blocks: {
    aria: "Bloques de la sesión",
    done: "Hecho",
    srDone: " (hecho)",
    srNow: " (ahora)",
    left: (n) => `faltan ${n}`,
    warmup: { name: "Calentamiento", hint: "Lo que ya sabes" },
    reviews: { name: "Repasos", hint: "Toca ahora" },
    learn: { name: "Aprender", hint: "Algo nuevo" },
    mixed: { name: "Mezcla", hint: "Elige entre parecidos" },
    challenge: { name: "Reto", hint: "Un contexto nuevo" },
  },
};
