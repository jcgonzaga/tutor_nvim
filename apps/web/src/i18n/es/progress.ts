import type { Messages } from "../messages";

/** Spanish text of the progress area; same shape as the English one. */
export const progress: Messages["progress"] = {
  title: "Progreso",
  eyebrow: "Tutor NeoVim",
  sessions: "Sesiones completadas",
  attempts: "Ejercicios intentados",
  solved: "Resueltos",
  xp: "XP",
  xpLevel: (xp, level) => `${xp} XP · nivel ${level}`,
  streak: "Racha",
  streakValue: (days, longest) => `${days} ${days === 1 ? "día" : "días"} (la mejor: ${longest})`,
  bestCombo: "Mejor combo",
  reviewsDue: "Repasos pendientes ahora",
  nextReview: "Próximo repaso",
  nothingAhead: "Nada programado más adelante",
  skills: (count) => `Habilidades (${count})`,
  backToToday: "Volver a hoy",
  skillMap: "Mapa de habilidades",
};
