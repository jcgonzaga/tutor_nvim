import type { Messages } from "../messages";

/** Spanish text of the session area; same shape as the English one. */
export const session: Messages["session"] = {
  eyebrowFallback: "Sesión",
  repeatSuffix: " · otra vez",
  progress: (done, total) => `${done} de ${total}`,
  giveUp: "No lo sé",
  continue: "Continuar",
  finish: "Terminar",
  metrics: {
    time: "velocidad",
    efficiency: "eficiencia",
    performance: "puntuación",
    reaction: "tiempo de reacción",
  },
  newPersonalBest: (metrics) => `Nueva mejor marca: ${metrics}`,
  missingExercise: {
    title: "Sesión",
    text: "Esta sesión hace referencia a un ejercicio que ya no existe.",
    close: "Terminar sesión",
  },
  summary: {
    title: "Sesión completada",
    eyebrow: "Resumen",
    exercises: "Ejercicios",
    exercisesValue: (solved, total) => `${solved} resueltos de ${total}`,
    averageScore: "Puntuación media",
    reviewsCompleted: "Repasos completados",
    xp: "XP",
    xpValue: (xp) => `+${xp} XP`,
    xpBonus: (bonus) => `incluidos ${bonus} por terminar la sesión de hoy`,
    bestCombo: "Mejor combo",
    streak: "Racha",
    streakValue: (days, firstOfDay) =>
      `racha de ${days} ${days === 1 ? "día" : "días"}${firstOfDay ? "" : " (hoy ya cuenta)"}`,
    skillsTrained: "Habilidades practicadas",
    personalBests: "Mejores marcas",
    noRecords: "Sin récords nuevos esta vez. Aparecen cuando superas una resolución anterior.",
    done: "Listo",
  },
};
