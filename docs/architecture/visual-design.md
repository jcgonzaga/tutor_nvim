# Visual design: graphite and amber

Implemented from the Design canvas "Tutor NeoVim" (artboards: Inicio, Mapa de habilidades, Sistema
visual, practice, feedback and onboarding). The background goes quiet so the code is the only thing
that glows; the amber cursor guides the eye on every screen.

## Where it lives

| What                          | Where                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Colour and font tokens        | `apps/web/src/index.css` (`@theme`: `canvas`, `surface`, `raised`, `line`, `ink`, `ink-2`, `ink-3`, `amber`, `azure`, `ember`)             |
| Fonts                         | Atkinson Hyperlegible Next (UI) and JetBrains Mono (code, keys), self-hosted through `@fontsource`, Latin subset only; no font CDN request |
| Buttons, cards, links         | `apps/web/src/ui/styles.ts`                                                                                                                |
| Keycaps, `Enter` hints        | `apps/web/src/ui/Kbd.tsx`                                                                                                                  |
| Mastery gauge (4 segments)    | `apps/web/src/ui/Segments.tsx`                                                                                                             |
| NORMAL / INSERT pill          | `apps/web/src/ui/ModePill.tsx`                                                                                                             |
| Navigation header, page frame | `apps/web/src/ui/AppHeader.tsx`, `apps/web/src/ui/Page.tsx`                                                                                |
| Editor (gutter, cursor)       | `apps/web/src/practice/EditorView.tsx`                                                                                                     |
| Setup flow frame              | `apps/web/src/onboarding/OnboardingShell.tsx`                                                                                              |

## Rules the design sets, and how they are kept

- **Colour never goes alone.** Mastery stage = number of filled segments plus its word; locked =
  dashed outline plus a lock; mode = pill with the word; cursor = block (NORMAL), bar (INSERT),
  underline (operator pending); outcomes carry an icon and a headline.
- **Contrast** against the background: text 16:1, secondary 9.4:1, tertiary 5.5:1. axe (WCAG AA) runs
  on every screen in `tests/e2e/accessibility.spec.ts`.
- **One main action per screen**, as an amber button; the keyboard shortcut is shown on it.
- **Practice stays low-distraction**: exit, progress, instruction, editor and mode only; no
  navigation (AGENTS.md section 18).
- **Reduced motion** is honoured globally in `index.css`.

## Deliberate differences from the canvas

- Copy stays in English (the app's language today); the canvas is in Spanish. Localisation is a
  separate decision: every string is still inline.
- The canvas shows things the product has no data or behaviour for yet and they were not invented:
  the five-stage stepper (Discover, Imitate, Recall, Distinguish, Transfer) and its Imitate and
  Discover screens, the key chips on skill nodes, a per-skill filename in the editor status bar,
  the multi-goal checklist and the "Reaction" and "Your rhythm" panels.
- Results are shown under the editor instead of on a separate screen, so the buffer stays visible
  and every existing flow keeps working.
- The skill map keeps its data-driven columns (depth of prerequisites, "Step n") rather than fixed
  tiers; the skill's own page plays the role of the canvas' detail panel.
- The home "session blocks" bar appears while a session is in progress (the plan is built when it
  starts); the week row in the streak card is exact (taken from completed sessions).
