/**
 * `pnpm content:validate` - schema-validates every skill and exercise and cross-checks them:
 * duplicate ids/slugs, unknown or disabled skills, unknown prerequisites, prerequisite cycles.
 * Exits non-zero on any problem.
 */
import { parseKeymapLayers } from "@tutor-nvim/exercise-schema";
import { loadContentOrExit, readKeymapInput } from "./content-fs";

const bundle = loadContentOrExit("content:validate");
// `loadContentOrExit` already validated the catalogs; this only counts them for the summary.
const keymapLayers = parseKeymapLayers(readKeymapInput());
console.log(
  `content:validate OK - ${bundle.skills.length} skills, ${bundle.exercises.length} exercises, ${keymapLayers.length} keymap layer${keymapLayers.length === 1 ? "" : "s"} valid`,
);
