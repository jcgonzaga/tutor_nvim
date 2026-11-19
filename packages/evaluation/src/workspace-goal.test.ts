import { describe, expect, it } from "vitest";

import type { WorkspaceObjectiveView } from "@tutor-nvim/workspace-engine";

import { evaluateWorkspaceObjective } from "./index";

/**
 * End-state objectives for the simulated workspace (S1, S2). Each goal reports what it expected and
 * what it found, so a screen can show which goal failed instead of "wrong"; nothing here looks at a
 * keystroke or a strategy, and the same state always gives the same answer.
 */

const MAIN_TEXT = 'const mode = "development";';
const OTHER_TEXT = "export const other = 1;";

function state(): WorkspaceObjectiveView {
  return {
    files: { "src/main.ts": MAIN_TEXT, "src/other.ts": OTHER_TEXT },
    buffers: [
      { path: "src/main.ts", text: MAIN_TEXT },
      { path: "src/other.ts", text: OTHER_TEXT },
    ],
    activePath: "src/other.ts",
    layout: "side(leaf, stacked(leaf, leaf))",
    focus: 2,
    splitRatios: [0.5, 0.3],
    matches: [
      { path: "src/config.ts", line: 1, text: "export const config = { port: 3000 };" },
      { path: "src/server.ts", line: 3, text: "export const server = { port: config.port };" },
    ],
  };
}

describe("evaluateWorkspaceObjective reports what it expected and what it found", () => {
  it("accepts every goal kind in the union when the state matches", () => {
    const s = state();
    expect(evaluateWorkspaceObjective({ type: "active_file", path: "src/other.ts" }, s)).toEqual({
      met: true,
      failures: [],
    });
    expect(
      evaluateWorkspaceObjective(
        { type: "open_buffers", paths: ["src/main.ts", "src/other.ts"] },
        s,
      ),
    ).toEqual({ met: true, failures: [] });
    expect(
      evaluateWorkspaceObjective(
        { type: "buffer_text", path: "src/main.ts", targetLines: [MAIN_TEXT] },
        s,
      ),
    ).toEqual({ met: true, failures: [] });
    expect(
      evaluateWorkspaceObjective(
        { type: "file_text", path: "src/main.ts", targetLines: [MAIN_TEXT] },
        s,
      ),
    ).toEqual({ met: true, failures: [] });
    expect(
      evaluateWorkspaceObjective({ type: "layout", text: "side(leaf, stacked(leaf, leaf))" }, s),
    ).toEqual({ met: true, failures: [] });
    expect(evaluateWorkspaceObjective({ type: "focus", leaf: 2 }, s)).toEqual({
      met: true,
      failures: [],
    });
    expect(evaluateWorkspaceObjective({ type: "split_ratio", index: 1, ratio: 0.3 }, s)).toEqual({
      met: true,
      failures: [],
    });
    expect(
      evaluateWorkspaceObjective(
        {
          type: "grep_matches",
          matches: [
            { path: "src/config.ts", line: 1, text: "export const config = { port: 3000 };" },
            {
              path: "src/server.ts",
              line: 3,
              text: "export const server = { port: config.port };",
            },
          ],
        },
        s,
      ),
    ).toEqual({ met: true, failures: [] });
  });

  it("compares the grep rows it recorded, in order, and lists both sides on failure", () => {
    const expected = [{ path: "src/nope.ts", line: 2, text: "sql" }];
    expect(
      evaluateWorkspaceObjective({ type: "grep_matches", matches: expected }, state()).failures,
    ).toEqual([
      `grep_matches: expected ${JSON.stringify(expected)}, found ${JSON.stringify(state().matches)}`,
    ]);

    // The same two rows in the other order are not the same search: project order is the answer.
    const reversed = [...state().matches].reverse();
    expect(
      evaluateWorkspaceObjective({ type: "grep_matches", matches: reversed }, state()).met,
    ).toBe(false);

    // A row that reads differently is reported with both sides, not with a count.
    const changed = [{ ...state().matches[0]!, text: "export const config = { port: 8080 };" }];
    expect(
      evaluateWorkspaceObjective({ type: "grep_matches", matches: changed }, state()).failures,
    ).toEqual([
      `grep_matches: expected ${JSON.stringify(changed)}, found ${JSON.stringify(state().matches)}`,
    ]);
  });

  it("names the expected and the found active file", () => {
    expect(
      evaluateWorkspaceObjective({ type: "active_file", path: "src/nope.ts" }, state()),
    ).toEqual({
      met: false,
      failures: ['active_file: expected "src/nope.ts", found "src/other.ts"'],
    });
    expect(
      evaluateWorkspaceObjective(
        { type: "active_file", path: "src/main.ts" },
        { ...state(), activePath: undefined },
      ).failures,
    ).toEqual(['active_file: expected "src/main.ts", found no active file']);
  });

  it("compares open buffers as a set and lists both sides on failure", () => {
    expect(
      evaluateWorkspaceObjective({ type: "open_buffers", paths: ["src/main.ts"] }, state())
        .failures,
    ).toEqual(['open_buffers: expected ["src/main.ts"], found ["src/main.ts","src/other.ts"]']);
  });

  it("reads buffer text, including a trailing newline, and says when no buffer is open", () => {
    const withNewline = { ...state(), buffers: [{ path: "src/main.ts", text: `${MAIN_TEXT}\n` }] };
    expect(
      evaluateWorkspaceObjective(
        { type: "buffer_text", path: "src/main.ts", targetLines: [MAIN_TEXT] },
        withNewline,
      ),
    ).toEqual({ met: true, failures: [] });
    expect(
      evaluateWorkspaceObjective(
        { type: "buffer_text", path: "src/main.ts", targetLines: ["other"] },
        state(),
      ).failures,
    ).toEqual([
      `buffer_text: expected "src/main.ts" to read "other", found ${JSON.stringify(MAIN_TEXT)}`,
    ]);
    expect(
      evaluateWorkspaceObjective(
        { type: "buffer_text", path: "src/nope.ts", targetLines: ["other"] },
        state(),
      ).failures,
    ).toEqual(['buffer_text: expected an open buffer for "src/nope.ts", found none']);
  });

  it("asserts the disk, so saving is observable, and names a missing file", () => {
    expect(
      evaluateWorkspaceObjective(
        { type: "file_text", path: "src/main.ts", targetLines: ["saved"] },
        state(),
      ).failures,
    ).toEqual([
      `file_text: expected "src/main.ts" on disk to read "saved", found ${JSON.stringify(MAIN_TEXT)}`,
    ]);
    expect(
      evaluateWorkspaceObjective(
        { type: "file_text", path: "src/nope.ts", targetLines: ["x"] },
        state(),
      ).failures,
    ).toEqual(['file_text: expected "src/nope.ts" on disk, found no file']);
  });

  it("prints the layout the engine would print, and the focus index", () => {
    expect(
      evaluateWorkspaceObjective({ type: "layout", text: "side(leaf, leaf)" }, state()).failures,
    ).toEqual(['layout: expected "side(leaf, leaf)", found "side(leaf, stacked(leaf, leaf))"']);
    expect(evaluateWorkspaceObjective({ type: "focus", leaf: 0 }, state()).failures).toEqual([
      "focus: expected leaf 0, found leaf 2",
    ]);
    expect(
      evaluateWorkspaceObjective({ type: "focus", leaf: 1 }, { ...state(), focus: undefined })
        .failures,
    ).toEqual(["focus: expected leaf 1, found no focused leaf"]);
  });

  it("compares a split ratio with a tolerance of 0.01", () => {
    const ratio = (found: number): readonly string[] =>
      evaluateWorkspaceObjective(
        { type: "split_ratio", index: 0, ratio: 0.5 },
        { ...state(), splitRatios: [found] },
      ).failures;

    expect(ratio(0.5)).toEqual([]);
    expect(ratio(0.51)).toEqual([]);
    expect(ratio(0.49)).toEqual([]);
    // Floating point: 0.55 - 0.54 is 0.010000000000000009, still one hundredth.
    expect(
      evaluateWorkspaceObjective(
        { type: "split_ratio", index: 0, ratio: 0.55 },
        { ...state(), splitRatios: [0.54] },
      ).failures,
    ).toEqual([]);
    expect(ratio(0.52)).toEqual(["split_ratio: expected split 0 at 0.5, found 0.52"]);
    expect(
      evaluateWorkspaceObjective({ type: "split_ratio", index: 2, ratio: 0.5 }, state()).failures,
    ).toEqual(["split_ratio: expected split 2 at 0.5, found no split 2"]);
  });

  it("reports every failing goal of an all, in order, once", () => {
    expect(
      evaluateWorkspaceObjective(
        {
          type: "all",
          goals: [
            { type: "active_file", path: "src/nope.ts" },
            { type: "layout", text: "side(leaf, stacked(leaf, leaf))" },
            { type: "focus", leaf: 0 },
          ],
        },
        state(),
      ),
    ).toEqual({
      met: false,
      failures: [
        'active_file: expected "src/nope.ts", found "src/other.ts"',
        "focus: expected leaf 0, found leaf 2",
      ],
    });
    expect(
      evaluateWorkspaceObjective(
        {
          type: "all",
          goals: [
            { type: "active_file", path: "src/other.ts" },
            { type: "focus", leaf: 2 },
          ],
        },
        state(),
      ),
    ).toEqual({ met: true, failures: [] });
  });

  it("gives the same answer for the same state and does not change it", () => {
    const s = state();
    const before = JSON.stringify(s);
    const objective = { type: "all", goals: [{ type: "focus", leaf: 0 }] } as const;
    expect(evaluateWorkspaceObjective(objective, s)).toEqual(
      evaluateWorkspaceObjective(objective, s),
    );
    expect(JSON.stringify(s)).toBe(before);
  });

  it("treats a hundredth as the bound, not as a rounding step", () => {
    // Independent verification found 0.514 against 0.50 accepted, because the difference was rounded.
    const half = { ...state(), splitRatios: [0.5] };
    expect(
      evaluateWorkspaceObjective({ type: "split_ratio", index: 0, ratio: 0.514 }, half).met,
    ).toBe(false);
    expect(
      evaluateWorkspaceObjective({ type: "split_ratio", index: 0, ratio: 0.51 }, half).met,
    ).toBe(true);
  });
});
