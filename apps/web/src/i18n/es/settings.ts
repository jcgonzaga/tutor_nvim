import type { Messages } from "../messages";

/** Spanish text of the settings screen. */
export const settings: Messages["settings"] = {
  title: "Ajustes",
  eyebrow: "Tutor NeoVim",
  sound: {
    label: "Sonido",
    help: "Tonos breves al terminar un ejercicio. Nada depende de ellos: todos los resultados también se muestran en pantalla. Desactivado por defecto.",
  },
  analytics: {
    label: "Compartir datos de uso anónimos",
    help: "Ayuda a mejorar los ejercicios. Envía qué ejercicios y habilidades se empezaron, se resolvieron o fallaron, las pistas usadas y los tiempos, bajo un identificador aleatorio de este navegador. Nunca envía lo que escribes, tu texto, tu nombre ni tu correo. Desactivado por defecto; puedes desactivarlo cuando quieras.",
  },
  back: "Volver a hoy",
};
