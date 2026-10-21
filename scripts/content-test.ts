/**
 * `pnpm content:test` - validates the content, then executes every declared solution of every
 * exercise against the Vim engine and checks it reaches the objective with the classification it
 * was declared with. Exits non-zero on any problem.
 */
import { checkContent } from "@tutor-nvim/evaluation";
import { loadContentOrExit } from "./content-fs";

const bundle = loadContentOrExit("content:test");
const errors = checkContent(bundle);

if (errors.length > 0) {
  console.error(errors.join("\n"));
  console.error(
    `\ncontent:test failed (${errors.length} problem${errors.length === 1 ? "" : "s"})`,
  );
  process.exit(1);
}

const solutions = bundle.exercises.reduce(
  (total, exercise) => total + exercise.solutions.length,
  0,
);
console.log(
  `content:test OK - ${bundle.exercises.length} exercises, ${solutions} solutions reach their objective`,
);
