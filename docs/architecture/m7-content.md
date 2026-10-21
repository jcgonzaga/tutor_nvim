# M7 — MVP content: notes

Status: delivered. **21 skills, 120 exercises** (targets: ~20 and ≥100), every declared solution
executed by the Vim engine in CI (`pnpm content:test`: 120 exercises, 141 solutions).

Content stays declarative YAML (AGENTS 2.2); no application code was added for it. The only code
changes are tests that now hold the curriculum to the M7 targets.

## Curriculum map

Tiers follow the prerequisite graph (`content/skills`). Exercises per skill count every exercise that
trains it (an exercise can train two skills, e.g. `ci"` trains _change_ and _inside quotes_).

| Tier | Skill                                        | Builds on                  | Exercises |
| ---- | -------------------------------------------- | -------------------------- | --------- |
| 1    | `vim.mode.normal`                            | —                          | 5         |
| 1    | `vim.mode.insert`                            | normal                     | 5         |
| 1    | `vim.navigation.atomic` (h j k l)            | normal                     | 6         |
| 2    | `vim.navigation.words` (w)                   | atomic                     | 6         |
| 2    | `vim.navigation.line` (0 ^ $)                | atomic                     | 10        |
| 2    | `vim.navigation.find-char` (f)               | line                       | 6         |
| 2    | `vim.edit.delete-char` (x) _new_             | atomic                     | 5         |
| 2    | `vim.insert.append-open` (a o) _new_         | insert                     | 6         |
| 3    | `vim.navigation.word-ends` (b e B E W) _new_ | words                      | 5         |
| 3    | `vim.navigation.till-char` (t ; ,) _new_     | find-char                  | 6         |
| 3    | `vim.operator.delete`                        | words                      | 21        |
| 3    | `vim.operator.change`                        | insert, words              | 32        |
| 3    | `vim.operator.yank` (yank, put)              | delete                     | 6         |
| 3    | `vim.undo` (u, Ctrl+r)                       | delete                     | 7         |
| 4    | `vim.operator.lines` (dd yy cc) _new_        | delete                     | 6         |
| 4    | `vim.textobject.inner-word`                  | change                     | 7         |
| 4    | `vim.textobject.inner-quotes`                | change                     | 8         |
| 4    | `vim.textobject.inner-parentheses`           | change                     | 8         |
| 4    | `vim.textobject.inner-braces` _new_          | change                     | 6         |
| 5    | `vim.textobject.around` (a" a( a{) _new_     | inner quotes, inner parens | 6         |
| 5    | `vim.repeat` (.)                             | change, delete             | 6         |

## What the curriculum guarantees (tests/curriculum.test.ts)

- ≥ 20 skills, ≥ 100 exercises, and at least 10 exercises in each stage: _learn, imitate, recall,
  discriminate, transfer_.
- **Every skill** has ≥ 5 exercises, ≥ 3 different `language/context` pairs, ≥ 3 stages and a
  transfer exercise. This closes the M4 finding: a skill with a single context could never reach
  _mastered_ (transfer evidence is a new context).
- Each command of content groups A–E appears in optimal solutions (`h j k l`, `i a o`, `w b e 0 ^ $ f t ; ,`,
  `d c y dd yy cc cw`, `ciw diw ci" di" ci( da( ci{`, `u Ctrl+r .`, `x p P`).
- The high-priority patterns (`ci"`, `ci(`, `ciw`, `cw`, `dd`, `dw`) each have ≥ 5 variants **with
  different buffers**, not copies.
- Text objects are practiced in JavaScript, TypeScript, Python, Lua, JSON and shell.
- No two exercises share an instruction (the learner would read it as a repeat) or a
  buffer + cursor + goal; every exercise has ≥ 2 progressive hints; no hint before the last gives
  away the whole optimal sequence, and `recall`/`discriminate`/`transfer` instructions never state
  the keys.

## Learning stages in practice

- **learn**: first contact; the instruction or hint names the idea ("`a` appends after the cursor").
- **imitate**: same move, new text.
- **recall**: the instruction states the _goal_ only ("Rename count to total").
- **discriminate**: the choice is the point — `ciw` vs `cw`, `a` vs `i`, `p` vs `P`, `di(` vs `da(`,
  `W` vs `w`, `dw` vs `xxxxxxxxx`, inner vs outer parentheses. Slower or wrong-but-working routes are
  declared as alternative solutions (`valid`, `inefficient`, `anti-pattern`) so they are classified,
  not failed.
- **transfer**: the same skill in another language/context; these are the exercises that make
  _mastered_ reachable.

## How it was authored

Each exercise was written as a compact spec and a throwaway script (not committed: the YAML is the
source of truth) turned it into YAML **only after running its solutions on the engine** and comparing
with the objective. That caught my own mistakes before they reached the repo, for example:

- `dw` removes the trailing space, so "change then retype" alternatives needed a space of their own;
- `O` and `r` are outside the supported subset (AGENTS 6), so alternatives using them were rejected;
- an alternative reached the goal one key earlier than declared (`content:test` rejects keys after
  the goal);
- two instructions collided, and one skill had no transfer exercise (both now guarded by tests).

Because the engine subset has no counts (`3dd`), `F`/`T`, `A`/`I`/`O`, visual mode or `aw`, some natural
exercises cannot exist yet; none were faked.

## A walkthrough over the real curriculum (tests/curriculum-flow.test.ts)

A learner who always answers well, one session a day, starting after onboarding with no placement:

```text
day  0:  3 exercises,  3 unlocked,  0 fluent,  0 mastered
day  5: 15 exercises,  8 unlocked,  5 fluent,  3 mastered
day 10: 17 exercises, 20 unlocked, 12 fluent,  7 mastered
day 15: 12 exercises, 21 unlocked, 21 fluent, 12 mastered
day 20: 12 exercises, 21 unlocked, 21 fluent, 21 mastered
```

The test asserts: a session with something to do every day, every skill unlocks (no dead ends),
every skill gets to _fluent_, at least five reach _mastered_, sessions of 5–20 exercises once the basics are known.

## Findings to carry forward

1. **Day one is thin by construction.** Only `vim.mode.normal` is unlocked at the start, and a skill
   needs 2 attempts to unlock what follows, so the first session is three NORMAL-mode exercises.
   By day 5 sessions have ~15. A calibrated learner starts further along (M5 placement). If this
   feels slow in real use, the lever is the unlock threshold or merging the entry skills, not more content.
2. **Mastery looks generous for a perfect learner**: first skills _mastered_ around day 5, everything
   by day 20. Any attempt ≥ 12 h after the previous one counts as delayed recall, so daily practice
   accumulates retention quickly. The thresholds (M4 config) have not been tuned with real people.
   Recommended before launch: tune with analytics (M10), not by guessing.
3. **Instruction uniqueness is now a rule**, and the E2E helper that solves "whatever is on screen"
   depends on it.
4. Hints at level 1 are conceptual and level 2 is close to the answer by design; a few level 2
   hints are a bare key (`^`, `$`). Rewording them is a content polish for after real users.

## Known limitations

- Content is English only; exercises are short single-/few-line buffers (no scrolling).
- Contexts are realistic but small; no exercise yet mixes several commands in a longer task (those are M9 missions).
- The 120 exercises were checked for correctness by the engine, not play-tested with learners.
