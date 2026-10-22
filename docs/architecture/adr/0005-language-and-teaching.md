# ADR-0005 — Language, theory and explanations

Status: accepted. Decided by the project owner (2026-10-22).

## Context

The product is trained in Spanish by its owner, but the UI and all content are English. Learners also
met actions they did not know how to solve, and a failure only showed "your keys / a better way",
never why. The PRD already asks for both: stage 1 _Discover_ (one idea per screen, 10-30 s, §8) and
progressive fading "explanation → imitation → ..." (§4.4), and §4.7 says a detailed explanation
appears _after_ the attempt (§39: never a wall of text between exercises). The PRD says nothing about
the interface language.

## Decisions

1. **Spanish by default, English selectable.** The language is a device preference (`Prefs.language`,
   `es` | `en`, default `es`), not part of the synced profile. It is chosen in Settings and on the
   first onboarding screen. It is not inferred from the browser: the owner asked for Spanish first.
2. **Interface strings** live in a typed catalog (`apps/web/src/i18n`): one object per language with
   the same shape, so a missing translation is a type error. No i18n library: the app needs
   key lookup and a few functions for plurals, nothing else (AGENTS 23).
3. **Content text** stays language-neutral in the exercise/skill YAML (English is the source
   language: ids, slugs, buffers, solutions, key sequences). Spanish text lives in overlays,
   `content/locales/es/{skills,exercises}/<same file name>`, keyed by `id` and holding only the
   translatable fields (title, description, instruction, hint texts, lesson cards, explanation).
   Content validation rejects an overlay with an unknown id, a missing translation, or a different
   number of hints or lesson cards than the source, so CI keeps both languages complete.
4. **Theory ("Discover")**: a skill may carry a `lesson`, 1-4 cards of one idea each (title, short
   body, optional keys shown as keycaps). It is shown **once**, before the first exercise that trains
   a skill the learner has not seen it for and is still _learning_; it can be skipped and reopened
   from the skill's page. "Seen" is a device preference (`Prefs.seenLessons`), so a new device shows it
   once more, which costs seconds and avoids a profile migration and server change. Reading theory
   never feeds mastery or XP (AGENTS 2.7, 15).
5. **Explanations after the attempt** (`explanation`, why the best solution works): shown when the
   exercise was **not solved** or the performance score is **50 or lower** (solved, but badly or far
   slower than the optimal route). Collapsed content, never before the attempt, never between
   exercises. Anti-pattern findings are explained in the same panel from the catalog. All
   deterministic: no AI in the loop (AGENTS 2.5).
6. Every enabled skill needs a `lesson` and every exercise an `explanation` in both languages; a
   content test enforces it.

## Consequences

- Additive schema change: `lesson` (skill) and `explanation` (exercise) are optional in the schema, so
  `schemaVersion` stays 1; the completeness is a content-quality test, not a schema rule.
- The web bundle includes the Spanish overlays (measured against the performance budgets).
- The API ignores localization; it keeps serving ids and English titles.
- Translating means writing a new overlay folder plus a catalog; the code does not change.
