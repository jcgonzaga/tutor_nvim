import type { Messages } from "../messages";

/** Spanish text of the map area; same shape as the English one. */
export const map: Messages["map"] = {
  title: "Mapa de habilidades",
  lead: (count) =>
    `${count} habilidades. Cada una se desbloquea al practicar las que la preceden. Elige una habilidad para ver los detalles.`,
  legend: "Leyenda",
  step: (n) => `Paso ${n}`,
  reviewDue: "Repaso pendiente",
  backToToday: "Volver a hoy",
  detail: {
    eyebrow: "Habilidad",
    notFound: "Habilidad no encontrada",
    backToMap: "Volver al mapa de habilidades",
    masteryOutOf: "/ 100",
    lockedReason: (prerequisites) => `Bloqueada hasta que practiques: ${prerequisites}.`,
    placedNote:
      "La prueba inicial te colocó más allá de esta habilidad. Aún no hay evidencias, así que practícala para que cuente.",
    dimensions: {
      accuracy: "Precisión",
      strategy: "Estrategia",
      fluency: "Fluidez",
      retention: "Retención",
      transfer: "Transferencia",
    },
    attempts: "Intentos",
    nextReview: "Próximo repaso",
    notScheduled: "Aún sin programar",
    toMaster: "Para dominarla",
    masteryNote:
      "Dominarla exige un repaso acertado tras un tiempo sin practicar y la habilidad en otro contexto: repetirla hoy no basta.",
    requires: "Requiere",
    leadsTo: "Lleva a",
    blockerCriteria: {
      mastery: "dominio",
      accuracy: "precisión",
      strategy: "estrategia",
      transfer: "transferencia",
      retention: "retención",
      "delayed recalls": "recuerdos tras una pausa",
      "transfer exercises": "ejercicios de transferencia",
    },
  },
};
