import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/**
 * T-907: a production deploy is blocked when the content is broken. The deploy job depends on
 * `pnpm content:ci`, which is these two scripts, so what must hold is that each one exits non-zero
 * for each kind of defect. This runs the real scripts against a copy of the real content.
 */
const repo = fileURLToPath(new URL("..", import.meta.url));
const tsx = join(repo, "node_modules/.bin/tsx");

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

function run(script: "content-validate" | "content-test", root: string) {
  try {
    const stdout = execFileSync(tsx, [join(repo, "scripts", `${script}.ts`)], {
      cwd: repo,
      env: { ...process.env, CONTENT_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? 1, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

const edit = (root: string, file: string, transform: (text: string) => string) => {
  const path = join(root, file);
  writeFileSync(path, transform(readFileSync(path, "utf8")));
};

describe("content integrity gate (T-907)", () => {
  it("passes on the real content", () => {
    const root = copyOfContent();
    expect(run("content-validate", root).code).toBe(0);
    expect(run("content-test", root).code).toBe(0);
  }, 60_000);

  it("blocks an exercise that breaks the schema", () => {
    const root = copyOfContent();
    edit(root, "exercises/vim-delete-001.yaml", (text) => `${text}\nbogus_field: true\n`);
    const result = run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("vim-delete-001.yaml");
  }, 60_000);

  it("blocks a declared solution that does not reach the objective", () => {
    const root = copyOfContent();
    edit(root, "exercises/vim-delete-001.yaml", (text) =>
      text.replace(/sequence: "dd"/, 'sequence: "x"'),
    );
    const result = run("content-test", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("does not reach the objective");
  }, 60_000);

  it("blocks a prerequisite that points at no skill", () => {
    const root = copyOfContent();
    edit(root, "skills/vim.navigation.words.yaml", (text) =>
      text.replace("  - vim.navigation.atomic", "  - vim.navigation.does-not-exist"),
    );
    const result = run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("vim.navigation.does-not-exist");
  }, 60_000);

  it("blocks a duplicate slug", () => {
    const root = copyOfContent();
    const original = readFileSync(join(root, "exercises/vim-delete-001.yaml"), "utf8");
    writeFileSync(
      join(root, "exercises/vim-delete-copy.yaml"),
      original.replace(/^id: .*$/m, "id: vim-delete-copy"),
    );
    const result = run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/duplicate exercise slug/);
  }, 60_000);

  it("blocks a prerequisite cycle", () => {
    const root = copyOfContent();
    edit(root, "skills/vim.navigation.atomic.yaml", (text) =>
      text.replace(
        "prerequisites:\n  - vim.mode.normal",
        "prerequisites:\n  - vim.navigation.words",
      ),
    );
    const result = run("content-validate", root);
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/cycle/);
  }, 60_000);
});
