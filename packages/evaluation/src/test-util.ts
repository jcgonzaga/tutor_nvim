import {
  parseVimExercise,
  type VimExercise,
  type VimExerciseInput,
} from "@tutor-nvim/exercise-schema";
import { parseKeySequence } from "@tutor-nvim/vim-engine";
import { advanceAttempt, startAttempt, type VimAttempt } from "./attempt";

/** The canonical `ci"` exercise with any field overridden; the input is validated like real content. */
export function exerciseWith(overrides: Partial<VimExerciseInput> = {}): VimExercise {
  return parseVimExercise({
    schemaVersion: 1,
    id: "vim-test-001",
    slug: "vim.test.basic-001",
    title: "Test exercise",
    skillIds: ["vim.operator.change"],
    mode: "recall",
    difficulty: 2,
    initialState: {
      buffer: 'const mode = "development";\n',
      cursor: { line: 1, column: 18 },
      vimMode: "normal",
    },
    objective: { type: "buffer_equals", target: 'const mode = "production";\n' },
    evaluation: { requireFinalNormalMode: true },
    solutions: [{ sequence: 'ci"production<Esc>', classification: "optimal" }],
    ...overrides,
  });
}

/** Plays `sequence` key by key; timestamps default to 10 ms apart, or are given one per key. */
export function play(
  exercise: VimExercise,
  sequence: string,
  options: { startedAt?: number; timestamps?: readonly number[] } = {},
): VimAttempt {
  const { startedAt = 0, timestamps } = options;
  const keys = parseKeySequence(sequence);
  if (timestamps && timestamps.length !== keys.length) {
    throw new Error(`expected ${keys.length} timestamps, got ${timestamps.length}`);
  }
  return keys.reduce(
    (attempt, key, index) =>
      advanceAttempt(exercise, attempt, {
        ...key,
        timestamp: timestamps?.[index] ?? startedAt + (index + 1) * 10,
      }),
    startAttempt(exercise, startedAt),
  );
}
