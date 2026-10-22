import type { Messages } from "../messages";

/** Spanish text of the practice area; same shape as the English one. */
export const practice: Messages["practice"] = {
  exit: "Salir",
  defaultEyebrow: "Reto",
  editorLabel: "Editor de práctica de Vim",
  terminalLabel: "Terminal de práctica de shell",
  terminalOutput: "Salida de la terminal",
  pendingCommand: "comando pendiente",
  cursorPosition: "posición del cursor",
  notAccepted: (key) => `${key} no aceptada`,
  combo: "Combo",
  keys: (n) => `${n} ${n === 1 ? "tecla" : "teclas"}`,
  focusHint: "Haz clic en el editor, o pulsa Tab hasta enfocarlo, para empezar a escribir.",
  hintLabel: (level) => `Pista ${level}: `,
  showHint: "Mostrar pista",
  hintSoon: "Pista disponible pronto",
  feedback: {
    perfect: { title: "Perfecto", detail: "Mejor estrategia, sin errores, sin pistas." },
    completed: { title: "Completado", detail: "Resuelto. Hay una forma más limpia." },
    failed: {
      title: "No resuelto",
      detail: "Es información útil: volverá para repasar.",
    },
    youTyped: "Escribiste",
    nothing: "(nada)",
    oneWay: "Una forma",
    betterWay: "Mejor forma",
    score: "Puntuación",
    hintsUsed: (n) =>
      `${n === 1 ? "1 pista usada" : `${n} pistas usadas`}: cuenta menos para el dominio.`,
  },
  result: {
    success: "ÉXITO",
    notSolved: "NO RESUELTO",
    strategy: "Estrategia",
    keystrokes: "Pulsaciones",
    firstInput: "Primera tecla",
    duration: "Duración",
    efficiency: "Eficiencia",
    performance: "Rendimiento",
    errors: "Errores",
    hintsUsed: "Pistas usadas",
    tryAgain: "Reintentar",
    nextExercise: "Siguiente ejercicio",
    antiPatterns: {
      repeated_x: "x repetida: prueba un movimiento u operador que borre más de una vez",
      excessive_hjkl: "Muchas pulsaciones de h/j/k/l: busca un movimiento más rápido",
      arrow_keys: "Flechas: quédate en la fila base",
      insert_mode_navigation: "Moverte en modo INSERT: sal antes con Esc",
      repeated_escape: "Esc pulsada varias veces: una basta",
      repeated_failed_command:
        "El mismo comando falló una y otra vez: lee el error y luego cámbialo",
      cd_up_chain: "Varios cd .. seguidos: una sola ruta (cd ../..) te lleva de una vez",
      rm_rf_wildcard: "rm -r con comodín borra mucho de golpe: nombra lo que quieres eliminar",
    },
  },
};
