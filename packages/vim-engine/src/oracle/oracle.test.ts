import { describe, expect, it } from "vitest";
import { createVimState, runKeys } from "../engine";
import { parseKeySequence } from "../keys";
import type { Register } from "../types";
import { ORACLE_CASES, type OracleCase } from "./cases";
import type { OracleFixtures } from "./fixtures";
import fixtures from "./vim-oracle.json";

/**
 * Differential tests: every case was run through real Vim to produce
 * `vim-oracle.json` (`pnpm vim:oracle`), and this engine must end in the same
 * buffer, cursor and unnamed register.
 */
const expectations = (fixtures as OracleFixtures).cases;

interface Outcome {
  readonly lines: readonly string[];
  readonly cursor: readonly [number, number];
  readonly register: Register | null;
}

function expectedRegister(text: string, type: string): Register | null {
  if (type === "") return null;
  return type === "V"
    ? { text: text.replace(/\n$/, ""), linewise: true }
    : { text, linewise: false };
}

function engineOutcome(testCase: OracleCase): Outcome {
  const state = runKeys(
    createVimState({
      lines: testCase.lines,
      cursor: { line: testCase.cursor[0], column: testCase.cursor[1] },
    }),
    parseKeySequence(testCase.keys),
  );
  return {
    lines: state.buffer.lines,
    cursor: [state.cursor.line, state.cursor.column],
    register: state.register,
  };
}

function vimOutcome(testCase: OracleCase): Outcome {
  const fixture = expectations[testCase.name];
  if (fixture === undefined || fixture.keys !== testCase.keys) {
    throw new Error(`Missing or stale oracle fixture for: ${testCase.name} (run pnpm vim:oracle)`);
  }
  return {
    lines: fixture.lines,
    cursor: [fixture.line, fixture.col],
    register: expectedRegister(fixture.register, fixture.registerType),
  };
}

const groups = new Map<string, OracleCase[]>();
for (const testCase of ORACLE_CASES) {
  const group = (testCase.name.split(" | ")[0] ?? "").replace(/^fuzz-\d+$/, "fuzz");
  groups.set(group, [...(groups.get(group) ?? []), testCase]);
}

describe("engine agrees with real Vim", () => {
  it("has a fresh fixture for every case", () => {
    expect(Object.keys(expectations).length).toBeGreaterThanOrEqual(ORACLE_CASES.length);
    for (const testCase of ORACLE_CASES) vimOutcome(testCase);
  });

  for (const [group, cases] of groups) {
    it(`${group} (${cases.length} cases)`, () => {
      const mismatches = cases
        .map((testCase) => ({
          name: testCase.name,
          vim: vimOutcome(testCase),
          engine: engineOutcome(testCase),
        }))
        .filter(({ vim, engine }) => JSON.stringify(vim) !== JSON.stringify(engine));

      expect(mismatches.length === 0 ? [] : mismatches.slice(0, 12)).toEqual([]);
    });
  }
});
