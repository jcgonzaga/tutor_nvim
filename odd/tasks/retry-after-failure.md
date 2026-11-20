# Retry after failure — let the learner redo an exercise they could not solve

Feature 1 of 3 requested by the owner. Scope: the practice loop only (web app). No schema, engine or content change.

## Specs

**S1** — After an attempt ends as a failure (solved = false), both in free practice and in the daily session, the result area offers a control that starts the same exercise again.

**S2** — The failed attempt is never deleted: it stays in the learner history and in the cloud outbox with `solved: false`. Retrying does not remove it.

**S3** — A retried attempt starts clean: new `startedAt`, empty input events, no revealed hints, and the editor owns the keyboard again.

**S4** — In the daily session, a retry does not advance the run a second time: it does not add a session item, does not change the item's recorded outcome, and grants no XP. The retry attempt is still recorded as evidence (history + mastery metrics).

**S5** — Free practice offers the give-up control (`giveUpLabel`) so a learner who cannot solve the exercise reaches a failed result and can retry it. Free practice still requires no profile and persists no attempt.

**S6** — A successful attempt shows no retry control in the daily session; the solved path keeps its single "Continue"/"Finish" control.

## Tasks

| ID  | Spec   | Route  | Commit  |
| --- | ------ | ------ | ------- |
| T1  | S1, S6 | inline | pending |
| T2  | S2, S4 | inline | pending |
| T3  | S3     | inline | pending |
| T4  | S5     | inline | pending |
| T5  | S1-S6  | inline | pending |

## Log

**L1 — original request (verbatim)**

> Revisa el proyecto y quiero hacer modificaciones:
>
> - Hay que añadir la opcion de volver a hacer el ejercicio cuando el usuario no lo puede hacer.
> - Vamos a añadir los atajos de teclado de Herdr, Omarchy, se tiene que poder elegir si el sistema ejecuta comandos y keybindings de Linux, nvim, Lazyvim, Herdr, Tmux, Omarchy, uno, varios o todos.
> - Hay que añadir mas historias de usuario, tipo, elegir un archivo, editarlo, volver a seleccionar otro archivo, pasar de un archivo a otro, es decir, procesos usuales de usuario, igual que con Omarchy, abrir mas ventanas, cerrarlas, redimensionarlas, etc. obten estos procesos usuales de usuario dev y añadelos

**L2 — owner decisions (option labels chosen)**

> 1. Corte: "3 features secuenciales, con documento ODD cada una"
> 2. Capas: "Capa como ambiente: perfil de keymap junto al simulador"
> 3. Alcance MVP: "ADR + milestone nuevo, y actualizar AGENTS.md"
> 4. Reintento: "En práctica libre y en sesión; el fallo queda en historial"

**L3 — evidence (explorer map)**

- `packages/evaluation/src/attempt.ts:210-213` `giveUpAttempt` freezes the attempt as a failure.
- `apps/web/src/practice/PracticeScreen.tsx:330-343` passes `reset` as `onRetry` to `ResultPanel`; `renderResult` also receives it but `SessionScreen` ignores it.
- `apps/web/src/practice/usePracticeAttempt.ts:35-36` `reset` calls `startAttempt` (fresh clock, empty events, no hints).
- `apps/web/src/session/SessionScreen.tsx:120-186` `handleFinish` records the attempt (cloud + `finishAttempt`) and advances the run through `completeSessionItem` before the feedback is read.
- `apps/web/src/FreePractice.tsx:20` passes no `onFinish`, no `renderResult`, no `giveUpLabel`: no give-up control and no persistence.
- `apps/web/src/practice/ResultPanel.tsx:69-78` already renders `tryAgain`.
- i18n keys today: `practice.tryAgain` / `practice.nextExercise`, `session.giveUp` / `session.continue` / `session.finish`.
