/**
 * `pnpm content:validate` - schema-validates every skill and exercise and cross-checks them:
 * duplicate ids/slugs, unknown or disabled skills, unknown prerequisites, prerequisite cycles.
 * Exits non-zero on any problem.
 */
import { loadContentOrExit } from "./content-fs";

const bundle = loadContentOrExit("content:validate");
console.log(
  `content:validate OK - ${bundle.skills.length} skills, ${bundle.exercises.length} exercises valid`,
);
