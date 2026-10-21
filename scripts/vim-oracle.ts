/**
 * `pnpm vim:oracle` - regenerates packages/vim-engine/src/oracle/vim-oracle.json by running
 * every oracle case through a real Vim (needs `vim` and `python3`). Developer tool: the
 * committed fixtures are what CI tests against, so CI does not need Vim.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createVimState, runKeys, parseKeySequence, tokenizeKeySequence } from "@tutor-nvim/vim-engine";
import { ORACLE_CASES } from "../packages/vim-engine/src/oracle/cases";
import type { OracleFixtures } from "../packages/vim-engine/src/oracle/fixtures";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "packages/vim-engine/src/oracle/vim-oracle.json");

/** Raw terminal bytes for a canonical key token. */
function rawKey(token: string): string {
  const named: Record<string, string> = {
    "<Esc>": "\x1b",
    "<CR>": "\r",
    "<Space>": " ",
    "<lt>": "<",
    "<Tab>": "\t",
    "<BS>": "\x7f",
  };
  const special = named[token];
  if (special !== undefined) return special;
  const ctrl = /^<C-(.)>$/.exec(token);
  if (ctrl?.[1]) return String.fromCharCode(ctrl[1].toUpperCase().charCodeAt(0) & 0x1f);
  if (token.startsWith("<")) throw new Error(`Cannot send ${token} to Vim`);
  return token;
}

/** Escape always travels alone so Vim never mistakes it for the start of an escape sequence. */
function toChunks(keys: string): string[] {
  const chunks: string[] = [];
  let batch = "";
  for (const token of tokenizeKeySequence(keys)) {
    if (token === "<Esc>") {
      if (batch) chunks.push(batch);
      batch = "";
      chunks.push("\x1b");
    } else {
      batch += rawKey(token);
    }
  }
  if (batch) chunks.push(batch);
  return chunks;
}

const names = new Set<string>();
for (const testCase of ORACLE_CASES) {
  if (names.has(testCase.name)) throw new Error(`Duplicate oracle case: ${testCase.name}`);
  names.add(testCase.name);
  const engine = runKeys(
    createVimState({ lines: testCase.lines, cursor: { line: testCase.cursor[0], column: testCase.cursor[1] } }),
    parseKeySequence(testCase.keys),
  );
  if (engine.mode !== "normal") throw new Error(`Oracle case must end in NORMAL mode: ${testCase.name}`);
}

// Incremental: keep fixtures whose case (name and keys) is unchanged, run only the rest.
const previous: OracleFixtures["cases"] = existsSync(output)
  ? (JSON.parse(readFileSync(output, "utf8")) as OracleFixtures).cases
  : {};
const pending = ORACLE_CASES.filter((testCase) => previous[testCase.name]?.keys !== testCase.keys);

console.log(`Running ${pending.length} of ${ORACLE_CASES.length} cases through Vim (two agreeing runs each)...`);
const started = Date.now();
const run = spawnSync("python3", [join(root, "tools/vim-oracle/run_vim.py")], {
  input: JSON.stringify({
    cases: pending.map((testCase) => ({
      id: testCase.name,
      lines: testCase.lines,
      line: testCase.cursor[0],
      col: testCase.cursor[1],
      chunks: toChunks(testCase.keys),
    })),
  }),
  encoding: "utf8",
  maxBuffer: 1 << 30,
});
if (run.status !== 0) throw new Error(`run_vim.py failed:\n${run.stderr}`);

const { version, results } = JSON.parse(run.stdout) as {
  version: string;
  results: Record<string, { error: string } | OracleFixtures["cases"][string]>;
};

const cases: OracleFixtures["cases"] = {};
const errors: string[] = [];
for (const testCase of ORACLE_CASES) {
  const result = previous[testCase.name]?.keys === testCase.keys ? previous[testCase.name] : results[testCase.name];
  if (result === undefined || "error" in result) {
    errors.push(`${testCase.name}: ${result === undefined ? "missing" : result.error}`);
  } else {
    cases[testCase.name] = { ...result, keys: testCase.keys } as OracleFixtures["cases"][string];
  }
}
if (errors.length > 0) {
  console.error(errors.slice(0, 20).join("\n"));
  throw new Error(`${errors.length} oracle cases failed to run`);
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ vim: version, cases } satisfies OracleFixtures));
console.log(`Wrote ${Object.keys(cases).length} fixtures from ${version} in ${Math.round((Date.now() - started) / 1000)}s`);
