import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { KEYMAP_ACTIONS } from "@tutor-nvim/exercise-schema";
import { afterEach, describe, expect, it } from "vitest";

/**
 * T-907: a production deploy is blocked when the content is broken. The deploy job depends on
 * `pnpm content:ci`, which is these two scripts, so what must hold is that each one exits non-zero
 * for each kind of defect. This runs the real scripts against a copy of the real content.
 *
 * The scripts are spawned asynchronously on purpose: they take seconds each, and a synchronous
 * spawn blocks the worker's event loop long enough for vitest's own RPC heartbeats to time out.
 */
const repo = fileURLToPath(new URL("..", import.meta.url));
const tsx = join(repo, "node_modules/.bin/tsx");
const execFileAsync = promisify(execFile);

let workdir: string | null = null;
afterEach(() => {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
  workdir = null;
});

function copyOfContent(): string {
  workdir = mkdtempSync(join(tmpdir(), "content-ci-"));
  cpSync(join(repo, "content"), workdir, { recursive: true });
  return workdir;
}

/**
 * An action the vocabulary knows and no catalog of this copy binds.
 *
 * The rule under test is "a solution no layer can solve is a defect", so the fixture has to name an
 * action no catalog provides — and which one that is changes as layers land (resizing was the
 * example until the window stories needed `C-w>`). Reading it from the copy keeps the test about the
 * rule instead of about today's catalogs.
 */
function unboundAction(root: string): string {
  const bound = new Set<string>();
  for (const file of readdirSync(join(root, "keymaps"))) {
    const text = readFileSync(join(root, "keymaps", file), "utf8");
    for (const match of text.matchAll(/^\s+action: (\S+)$/gm)) bound.add(match[1] ?? "");
  }
  // `edit.insert` is exempt by design — typing is the one action every layer performs — so the rule
  // can never be about it; its exemption has a test of its own below.
  const action = KEYMAP_ACTIONS.find((name) => name !== "edit.insert" && !bound.has(name));
  if (action === undefined) throw new Error("every action is bound: nothing to test the rule with");
  return action;
}

async function run(script: "content-validate" | "content-test", root: string) {
  try {
    const { stdout } = await execFileAsync(tsx, [join(repo, "scripts", `${script}.ts`)], {
      cwd: repo,
      env: { ...process.env, CONTENT_ROOT: root },
      encoding: "utf8",
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

const edit = (root: string, file: string, transform: (text: string) => string) => {
  const path = join(root, file);
  writeFileSync(path, transform(readFileSync(path, "utf8")));
};

/**
 * A workspace exercise as content: every exercise needs a source file and the Spanish overlay
 * (ADR-0005), so the copy gets both and the defect under test is the only one reported.
 */
function addWorkspaceExercise(root: string, id: string, yaml: string): void {
  writeFileSync(join(root, "exercises", `${id}.yaml`), yaml);
  writeFileSync(
    join(root, "locales/es/exercises", `${id}.yaml`),
    `id: ${id}\ntitle: "Divide la ventana"\ninstruction: "Divide la ventana en dos."\n`,
  );
}

const workspaceYaml = (id: string, solutions: string, objective: string): string =>
  `schemaVersion: 1
kind: workspace
id: ${id}
slug: workspace.${id}.001
title: "Split the window side by side"
instruction: "Split the window side by side."
skillIds: [vim.navigation.atomic]
mode: learn
difficulty: 1
initialState:
  files:
    src/main.ts: "one"
  path: src/main.ts
  cwd: /project
objective:
${objective}
solutions:
${solutions}`;

describe("content integrity gate (T-907)", () => {
  it("passes on the real content", async () => {
    const root = copyOfContent();
    expect((await run("content-validate", root)).code).toBe(0);
    expect((await run("content-test", root)).code).toBe(0);
  }, 60_000);

  it("blocks an exercise that breaks the schema", async () => {
    const root = copyOfContent();
    edit(root, "exercises/vim-delete-001.yaml", (text) => `${text}\nbogus_field: true\n`);
    const result = await run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("vim-delete-001.yaml");
  }, 60_000);

  it("blocks a declared solution that does not reach the objective", async () => {
    const root = copyOfContent();
    edit(root, "exercises/vim-delete-001.yaml", (text) =>
      text.replace(/sequence: "dd"/, 'sequence: "x"'),
    );
    const result = await run("content-test", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("does not reach the objective");
  }, 60_000);

  it("blocks a prerequisite that points at no skill", async () => {
    const root = copyOfContent();
    edit(root, "skills/vim.navigation.words.yaml", (text) =>
      text.replace("  - vim.navigation.atomic", "  - vim.navigation.does-not-exist"),
    );
    const result = await run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("vim.navigation.does-not-exist");
  }, 60_000);

  it("blocks a duplicate slug", async () => {
    const root = copyOfContent();
    const original = readFileSync(join(root, "exercises/vim-delete-001.yaml"), "utf8");
    writeFileSync(
      join(root, "exercises/vim-delete-copy.yaml"),
      original.replace(/^id: .*$/m, "id: vim-delete-copy"),
    );
    const result = await run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/duplicate exercise slug/);
  }, 60_000);

  it("blocks a keymap catalog that breaks the layer schema", async () => {
    const root = copyOfContent();
    edit(root, "keymaps/linux.yaml", (text) =>
      // `pane.zoom` is the ADR sketch; v1 calls the action `window.zoom`.
      text.replace("action: shell.clear-line", "action: pane.zoom"),
    );
    const result = await run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("keymaps/linux.yaml");
    expect(result.output).toContain("shell.clear-line");
  }, 60_000);

  it("blocks a catalog that repeats an inherited binding without override", async () => {
    const root = copyOfContent();
    edit(root, "keymaps/tmux-omarchy.yaml", (text) =>
      // `%` is already claimed by the `tmux` layer this catalog extends.
      text.replace(
        '  - keys: "v"\n    action: window.split-side-by-side\n    override: true\n',
        '  - keys: "%"\n    action: window.split-side-by-side\n',
      ),
    );
    const result = await run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("keymaps/tmux-omarchy.yaml");
    expect(result.output).toContain("set override: true");
  }, 60_000);

  it("blocks a catalog that declares the same row twice", async () => {
    const root = copyOfContent();
    // A byte-identical copy of the `z` row: same keys, action, modes and target, so the second one
    // can never be pressed and the catalog would be lying about what it offers.
    const row = [
      '  - keys: "z"',
      "    action: window.zoom",
      '    description: "Zoom the current pane to fill the terminal, and press it again to undo."',
      '    notModelled: "No multiplexer engine yet: packages/workspace-engine does not exist, so there is no pane to zoom."',
      "",
    ].join("\n");
    edit(root, "keymaps/tmux.yaml", (text) => text.replace(row, row + row));
    const result = await run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("keymaps/tmux.yaml");
    expect(result.output).toMatch(/declared twice|repeats/);
  }, 60_000);

  it("blocks a catalog binding that can never be reached", async () => {
    const root = copyOfContent();
    edit(root, "keymaps/tmux.yaml", (text) =>
      // `%` already completes the first binding of the catalog, so a second one on the same keys
      // is shadowed by it and can never fire.
      text.replace(
        '  - keys: "z"\n    action: window.zoom',
        '  - keys: "%"\n    action: window.zoom',
      ),
    );
    const result = await run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("keymaps/tmux.yaml");
    expect(result.output).toContain('"C-b %"');
    expect(result.output).toContain("window.zoom");
  }, 60_000);

  it("blocks an action solution no catalog provides", async () => {
    const root = copyOfContent();
    const action = unboundAction(root);
    edit(
      root,
      "exercises/vim-delete-001.yaml",
      // No catalog in content/keymaps binds this action, so this exercise could never be solved.
      (text) => `${text}\nactionSolutions:\n  - action: ${action}\n    classification: optimal\n`,
    );
    const result = await run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("vim-delete-001");
    expect(result.output).toContain(action);
  }, 60_000);

  it("blocks a workspace solution that does not reach its objective", async () => {
    const root = copyOfContent();
    const id = "workspace-split-wrong-001";
    addWorkspaceExercise(
      root,
      id,
      workspaceYaml(
        id,
        "  - actions: [window.split-stacked]\n    classification: optimal",
        '  type: all\n  goals:\n    - { type: layout, text: "side(leaf, leaf)" }\n    - { type: focus, leaf: 1 }',
      ),
    );
    const result = await run("content-test", root);
    expect(result.code).not.toBe(0);
    // The exercise, the solution and the objective it missed, so the author knows what to fix.
    expect(result.output).toContain(`workspace.${id}.001: solution 1`);
    expect(result.output).toContain(
      'layout: expected "side(leaf, leaf)", found "stacked(leaf, leaf)"',
    );
  }, 60_000);

  it("blocks a workspace solution the engine refuses", async () => {
    const root = copyOfContent();
    const id = "workspace-split-refused-001";
    addWorkspaceExercise(
      root,
      id,
      workspaceYaml(
        id,
        "  - actions: [window.split-side-by-side]\n    classification: optimal\n  - actions: [window.close]\n    classification: valid",
        '  type: layout\n  text: "side(leaf, leaf)"',
      ),
    );
    const result = await run("content-test", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain(`workspace.${id}.001: solution 2`);
    expect(result.output).toContain("window.close: the last window cannot be closed");
  }, 60_000);

  it("blocks a workspace solution action no catalog provides", async () => {
    const root = copyOfContent();
    const id = "workspace-split-unprovided-001";
    const action = unboundAction(root);
    addWorkspaceExercise(
      root,
      id,
      workspaceYaml(
        id,
        `  - actions: [${action}]\n    classification: optimal`,
        '  type: layout\n  text: "leaf"',
      ),
    );
    const result = await run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain(id);
    expect(result.output).toContain(action);
    expect(result.output).toContain("no keymap catalog provides");
  }, 60_000);

  it("exempts a text action no catalog can bind, and still blocks one that only a catalog can", async () => {
    // Typing is the one action every layer performs by typing: a binding names keys, never the text,
    // so `edit.insert` cannot be provided by a catalog and is not a missing layer (L9).
    const accepted = copyOfContent();
    const typedId = "workspace-split-typed-001";
    addWorkspaceExercise(
      accepted,
      typedId,
      workspaceYaml(
        typedId,
        '  - actions: [{ action: edit.insert, text: "two" }, file.save]\n    classification: optimal',
        '  type: file_text\n  path: src/main.ts\n  text: "two"',
      ),
    );
    expect((await run("content-validate", accepted)).code).toBe(0);

    // The rule itself still holds: an action no binding offers is a story no layer can solve.
    const rejected = copyOfContent();
    const unprovidedId = "workspace-split-unprovided-002";
    const action = unboundAction(rejected);
    addWorkspaceExercise(
      rejected,
      unprovidedId,
      workspaceYaml(
        unprovidedId,
        `  - actions: [${action}]\n    classification: optimal`,
        '  type: layout\n  text: "leaf"',
      ),
    );
    const result = await run("content-validate", rejected);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain(
      `${unprovidedId}: declares action solution "${action}", which no keymap catalog provides`,
    );
  }, 60_000);

  it("blocks a prerequisite cycle", async () => {
    const root = copyOfContent();
    edit(root, "skills/vim.navigation.atomic.yaml", (text) =>
      text.replace(
        "prerequisites:\n  - vim.mode.normal",
        "prerequisites:\n  - vim.navigation.words",
      ),
    );
    const result = await run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/cycle/);
  }, 60_000);
});
