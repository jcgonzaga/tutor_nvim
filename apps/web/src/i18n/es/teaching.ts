import type { Messages } from "../messages";

/** Texto de las tarjetas de teoría y de la explicación tras un intento flojo. */
export const teaching: Messages["teaching"] = {
  lesson: {
    eyebrow: (skill: string) => `Habilidad nueva: ${skill}`,
    region: (skill: string) => `Teoría: ${skill}`,
    progress: (current: number, total: number) => `Tarjeta ${current} de ${total}`,
    next: "Siguiente",
    back: "Atrás",
    start: "Entendido, a practicar",
    skip: "Saltar teoría",
    keysLabel: "Teclas",
  },
  explanation: {
    heading: "¿Por qué?",
    unsolved: "Este no se resolvió. Así funciona:",
    lowScore: "Lo resolviste, pero había una forma mucho más fácil:",
    habits: "Hábitos que corregir",
    theory: (skill: string) => `Repasar la teoría: ${skill}`,
  },
  skillPage: {
    heading: "Teoría",
    show: "Repasar la teoría",
  },
};
