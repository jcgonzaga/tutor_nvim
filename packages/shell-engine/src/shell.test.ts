import { describe, expect, it } from "vitest";
import {
  dispatchShellKey,
  getNode,
  initShell,
  parse,
  promptOf,
  runCommandLine,
  typeCommand,
} from "./index";

const run = (lines: readonly string[], init: Parameters<typeof initShell>[0] = {}) =>
  lines.reduce(runCommandLine, initShell(init));
const lastOutput = (state: ReturnType<typeof initShell>) =>
  state.transcript[state.transcript.length - 1]?.output;

describe("parsing", () => {
  it("reads quotes, pipes, connectors and redirections", () => {
    const parsed = parse(`grep "a b" f.txt | wc -l > out.txt && echo done`);
    expect(parsed.ok && parsed.list?.first.commands).toHaveLength(2);
    expect(parsed.ok && parsed.list?.rest).toHaveLength(1);
  });

  it("treats an empty line as nothing to do", () => {
    expect(parse("   ")).toEqual({ ok: true, list: null });
  });

  it.each([
    ["echo 'open", /unexpected EOF/],
    ['echo "open', /unexpected EOF/],
    ["ls ||", /unexpected end/],
    ["| ls", /unexpected token/],
    ["echo a &&", /unexpected end/],
    ["echo a > ", /unexpected end|unexpected token/],
    ["sleep 1 &", /not supported/],
    ["echo $(date)", /not supported/],
    ["(cd /)", /not supported/],
    ["cat <<EOF", /not supported/],
  ])("rejects %s without guessing", (line, message) => {
    const parsed = parse(line);
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.message).toMatch(message);
  });

  it("reports a syntax error as status 2 and leaves the file system alone", () => {
    const state = run(["touch a", "echo 'oops"], {});
    expect(state.status).toBe(2);
    expect(lastOutput(state)).toMatch(/^bash: unexpected EOF/);
    expect(getNode(state.root, ["home", "user", "a"])).toBeDefined();
  });
});

describe("the terminal", () => {
  it("shows a prompt with ~ for the home directory", () => {
    const state = run(["mkdir -p project/src", "cd project/src"]);
    expect(promptOf(state)).toBe("user@tutor:~/project/src$");
    expect(promptOf(run(["cd /"]))).toBe("user@tutor:/$");
    expect(promptOf(initShell())).toBe("user@tutor:~$");
  });

  it("records each command with the prompt it was typed at", () => {
    const state = run(["mkdir d", "cd d", "pwd"]);
    expect(state.transcript.map((entry) => [entry.prompt, entry.command, entry.output])).toEqual([
      ["user@tutor:~$", "mkdir d", ""],
      ["user@tutor:~$", "cd d", ""],
      ["user@tutor:~/d$", "pwd", "/home/user/d\n"],
    ]);
  });

  it("is deterministic and never mutates the state it was given", () => {
    const before = initShell({ files: { "a.txt": "x\n" } });
    const snapshot = JSON.stringify(before);
    const a = runCommandLine(before, "rm a.txt");
    const b = runCommandLine(before, "rm a.txt");
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(a).toEqual(b);
  });

  it("starts in the directory the exercise asks for", () => {
    const state = initShell({ files: { "project/a.txt": "" }, cwd: "project" });
    expect(promptOf(state)).toBe("user@tutor:~/project$");
    expect(lastOutput(runCommandLine(state, "ls"))).toBe("a.txt\n");
  });

  it("does not run scripts but honours the execute bit", () => {
    const state = run(["touch s.sh", "./s.sh", "chmod +x s.sh", "./s.sh"]);
    expect(state.transcript[1]?.output).toBe("bash: ./s.sh: Permission denied\n");
    expect(state.transcript[3]?.output).toBe("");
    expect(state.status).toBe(0);
  });

  it("cd inside a pipeline does not change the directory (it runs in a subshell)", () => {
    const state = run(["mkdir d", "cd d | cat", "pwd"]);
    expect(lastOutput(state)).toBe("/home/user\n");
  });
});

describe("typing", () => {
  it("builds the line key by key and runs it on Enter", () => {
    let state = initShell({ files: { "a.txt": "hi\n" } });
    for (const key of "cat a.txt") state = dispatchShellKey(state, { key }).state;
    expect(state.line).toBe("cat a.txt");
    state = dispatchShellKey(state, { key: "Enter" }).state;
    expect(state.line).toBe("");
    expect(lastOutput(state)).toBe("hi\n");
  });

  it("edits with Backspace, clears with Ctrl+U and abandons with Ctrl+C", () => {
    let state = initShell();
    for (const key of "lss") state = dispatchShellKey(state, { key }).state;
    state = dispatchShellKey(state, { key: "Backspace" }).state;
    expect(state.line).toBe("ls");
    state = dispatchShellKey(state, { key: "u", ctrl: true }).state;
    expect(state.line).toBe("");
    for (const key of "sleep") state = dispatchShellKey(state, { key }).state;
    state = dispatchShellKey(state, { key: "c", ctrl: true }).state;
    expect(state.line).toBe("");
    expect(state.status).toBe(130);
    expect(state.transcript[state.transcript.length - 1]?.command).toBe("sleep^C");
  });

  it("browses the history with the arrow keys", () => {
    let state = typeCommand(typeCommand(initShell(), "echo one"), "echo two");
    state = dispatchShellKey(state, { key: "ArrowUp" }).state;
    expect(state.line).toBe("echo two");
    state = dispatchShellKey(state, { key: "ArrowUp" }).state;
    expect(state.line).toBe("echo one");
    state = dispatchShellKey(state, { key: "ArrowDown" }).state;
    expect(state.line).toBe("echo two");
    state = dispatchShellKey(state, { key: "ArrowDown" }).state;
    expect(state.line).toBe("");
  });

  it("rejects keys the terminal does not model, without changing the line", () => {
    const state = typeCommand(initShell(), "ls");
    for (const input of [
      { key: "F5" },
      { key: "x", alt: true },
      { key: "Tab" },
      { key: "w", ctrl: true },
    ]) {
      const result = dispatchShellKey({ ...state, line: "abc" }, input);
      expect(result.accepted).toBe(false);
      expect(result.state.line).toBe("abc");
    }
  });

  it("keeps empty lines out of the history", () => {
    const state = typeCommand(typeCommand(initShell(), ""), "pwd");
    expect(state.history).toEqual(["pwd"]);
  });
});
