# M11 — Language, theory and explanations: notes

Decisions are in [ADR-0005](adr/0005-language-and-teaching.md). This is how it is built and how to
extend it.

## What a learner sees

- **Spanish by default, English on request.** A language selector is on the first onboarding screen
  and in Settings; it applies immediately and is remembered on the device (`Prefs.language`). It
  changes the interface and the text of every skill and exercise (titles, instructions, hints,
  theory, explanations). Key names, commands and code never change.
- **Theory once per skill (Discover, PRD §8).** Before the first exercise of a skill the learner is
  still learning, 2-4 cards, one idea each, with the keys as keycaps (or the command, for shell
  skills). Arrow keys or buttons move, Esc or "Skip" leaves; skipping counts as seen. The theory of
  any skill is one click away on its page, and inside the explanation described next.
  Theory never changes mastery or XP.
- **An explanation after the attempt, when it helps.** If the exercise was not solved, or the
  performance score is 50 or lower, the feedback adds a "Why?" panel: the exercise's explanation,
  a line per bad habit detected (repeated `x`, `cd ..` chains, ...), and the skill's theory. Good
  attempts see nothing extra, and nothing is ever shown before or between exercises.

## Where it lives

| What                                       | Where                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `lesson` (skill), `explanation` (exercise) | The English source YAML in `content/skills` and `content/exercises` (schema: optional)   |
| Spanish text                               | Overlays `content/locales/es/{skills,exercises}/<same file name>`, keyed by `id`         |
| Overlay validation and merging             | `packages/exercise-schema/src/locale.ts` (`validateLocale`, `localizeBundle`), pure      |
| When to explain (50 is configuration)      | `packages/evaluation/src/explain.ts` (`planExplanation`)                                 |
| Which theory to show                       | `packages/pedagogy/src/lessons.ts` (`lessonsToShow`)                                     |
| Interface text                             | `apps/web/src/i18n/{en,es}/<area>.ts`, typed so Spanish cannot miss a key                |
| Provider and hooks (`useT`, `useContent`)  | `apps/web/src/i18n/I18nProvider.tsx`, `apps/web/src/exercises.ts` (`contentFor(locale)`) |
| Theory and explanation components          | `apps/web/src/teaching/`                                                                 |
| Language and theory seen                   | Device preferences (`Prefs.language`, `Prefs.seenLessons`), not the synced profile       |

## Adding or changing content

1. Write the skill's `lesson` and every exercise's `explanation` in the English YAML.
2. Write the Spanish overlay with the same file name under `content/locales/es/`: the same `id`,
   the same number of hints and lesson cards (keys come from the source). Keep keys, commands and
   code untranslated.
3. `pnpm content:validate` reports every missing or mismatched translation; `tests/teaching-content.test.ts`
   requires a lesson per skill and an explanation per exercise, in both languages.
4. `pnpm content:embed` regenerates the API's copy of the content (a test fails while it is stale).

A new language is a new `content/locales/<code>/` folder, an entry in `LOCALES`, an
`apps/web/src/i18n/<code>/` catalog and a line in the language selector. No component changes.

## Interface text

Components read `const t = useT()` and write `{t.area.key}`. Strings with values are functions that
also carry the plural rules. `common` holds the shared vocabulary (mastery stages, strategy names,
habit names and explanations, exercise modes, time phrases). Rendering without a provider (unit
tests) speaks English. The Spanish glossary used: skill = habilidad, review = repaso, hint = pista,
streak = racha, personal best = mejor marca; mode names stay NORMAL / INSERT.

`catalog.test.ts` checks that both languages have the same entries, no empty text, and the agreed
vocabulary.

## Tests

- Unit: overlay validation and merging, `planExplanation`, `lessonsToShow`, preferences, the catalog,
  the theory and explanation components in both languages.
- Content: completeness of lessons, explanations and translations (395 checks).
- E2E (`tests/e2e/language-and-teaching.spec.ts`, from a clean browser): Spanish first, switching
  language, theory once and skippable, theory reopened from a skill, explanation after giving up,
  none after a clean solution. The other E2E suites seed English and already-seen theory
  (`tests/e2e/seed.ts`).

## Known limits

- The whole content and both interface languages ship in one JS chunk (budget raised to 300 KB
  gzip, see `m9-hardening.md`); per-language chunks would save about a third of the growth.
- "Theory seen" is per device: a new device shows each skill's theory once more.
- Explanations are static text written per exercise; they do not describe the exact mistake made
  beyond the detected habits. Anything dynamic must stay deterministic (AGENTS 2.5).
- The Spanish and English text were written without a native review: a pass over the wording and the
  technical claims of the explanations is worthwhile.
