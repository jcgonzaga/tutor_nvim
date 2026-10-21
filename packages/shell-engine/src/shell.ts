import { expandWord, expandWords, type ExpandContext } from "./expand";
import {
  file,
  fsFromFiles,
  getNode,
  joinPath,
  resolveParts,
  setNode,
  type DirNode,
  type FileNode,
  type FsNode,
} from "./fs";
import { parse, type Pipeline, type SimpleCommand } from "./parse";
import {
  cat,
  chmod,
  cp,
  echo,
  ls,
  mkdir,
  mv,
  pwd,
  rm,
  touch,
  canWrite,
  canRead,
} from "./commands/files";
import { find, grep, head, sort, tail, wc } from "./commands/text";
import { failure, ok, q, type Command, type CommandResult } from "./commands/types";

export const COMMANDS: Readonly<Record<string, Command>> = {
  pwd,
  ls,
  cat,
  echo,
  mkdir,
  touch,
  cp,
  mv,
  rm,
  chmod,
  grep,
  find,
  wc,
  head,
  tail,
  sort,
  true: () => ok(),
  false: () => ({ stdout: "", stderr: "", status: 1 }),
};

/** What a learner sees in the terminal: each command line followed by its output. */
export interface TranscriptEntry {
  /** The prompt as it was when the command was typed, e.g. `user@tutor:~/project$`. */
  readonly prompt: string;
  readonly command: string;
  readonly output: string;
}

export interface ShellState {
  readonly root: DirNode;
  readonly cwd: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  /** Exit status of the last command (`$?`). */
  readonly status: number;
  /** The command line being typed. */
  readonly line: string;
  readonly history: readonly string[];
  /** Index into `history` while browsing with the arrow keys; `null` when typing a new line. */
  readonly historyIndex: number | null;
  readonly transcript: readonly TranscriptEntry[];
}

export interface ShellInit {
  /** Initial files, as `{ "project/src/a.js": "..." }`; a trailing `/` makes an empty directory. */
  readonly files?: Readonly<
    Record<string, string | { readonly content: string; readonly mode: number }>
  >;
  readonly home?: string;
  /** Directory the session starts in; defaults to the home directory. */
  readonly cwd?: string;
}

export function initShell(init: ShellInit = {}): ShellState {
  const home = init.home ?? "/home/user";
  const homeParts = resolveParts([], home);
  // The home directory always exists, even when no files are given.
  const prefixed: Record<string, string | FileNode> = { [`${home.replace(/\/$/, "")}/`]: "" };
  for (const [path, value] of Object.entries(init.files ?? {})) {
    prefixed[path.startsWith("/") ? path : `${home.replace(/\/$/, "")}/${path}`] =
      typeof value === "string" ? value : file(value.content, value.mode);
  }
  const cwd = resolveParts(homeParts, init.cwd ?? ".");
  return {
    root: fsFromFiles(prefixed),
    cwd,
    env: { HOME: home, USER: "user", PWD: joinPath(cwd), OLDPWD: "" },
    status: 0,
    line: "",
    history: [],
    historyIndex: null,
    transcript: [],
  };
}

/** `user@tutor:~/project$` with `~` standing for the home directory. */
export function promptOf(state: Pick<ShellState, "cwd" | "env">): string {
  const home = resolveParts([], state.env.HOME ?? "/");
  const inHome = home.every((part, i) => state.cwd[i] === part);
  const shown = inHome
    ? `~${state.cwd.length > home.length ? `/${state.cwd.slice(home.length).join("/")}` : ""}`
    : joinPath(state.cwd);
  return `user@tutor:${shown}$`;
}

interface Run {
  root: DirNode;
  cwd: readonly string[];
  env: Readonly<Record<string, string>>;
  status: number;
  output: string;
}

const bash = (message: string): string => `bash: ${message}\n`;

function changeDirectory(args: readonly string[], run: Run): CommandResult {
  if (args.length > 1) return failure("bash: cd: too many arguments");
  let target = args[0] ?? run.env.HOME ?? "/";
  let announce = false;
  if (target === "-") {
    if (!run.env.OLDPWD) return failure("bash: cd: OLDPWD not set");
    target = run.env.OLDPWD;
    announce = true;
  }
  if (target === "~" || target.startsWith("~/")) target = (run.env.HOME ?? "/") + target.slice(1);
  const parts = resolveParts(run.cwd, target);
  const node = getNode(run.root, parts);
  const shown = args[0] ?? target;
  if (node === undefined) return failure(`bash: cd: ${shown}: No such file or directory`);
  if (node.kind !== "dir") return failure(`bash: cd: ${shown}: Not a directory`);
  if ((node.mode & 0o100) === 0) return failure(`bash: cd: ${shown}: Permission denied`);
  return ok(announce ? `${joinPath(parts)}\n` : "", {
    cwd: parts,
    env: { ...run.env, OLDPWD: joinPath(run.cwd), PWD: joinPath(parts) },
  });
}

/** Writes `text` to a redirection target; returns an error message or the updated tree. */
function writeTo(
  root: DirNode,
  cwd: readonly string[],
  target: string,
  text: string,
  append: boolean,
): { root: DirNode } | { error: string } {
  const parts = resolveParts(cwd, target);
  const existing = getNode(root, parts);
  if (existing?.kind === "dir") return { error: `${target}: Is a directory` };
  if (existing !== undefined && !canWrite(existing))
    return { error: `${target}: Permission denied` };
  const parent = getNode(root, parts.slice(0, -1));
  if (parent === undefined) return { error: `${target}: No such file or directory` };
  if (parent.kind !== "dir") return { error: `${target}: Not a directory` };
  const content = append && existing?.kind === "file" ? existing.content + text : text;
  const node: FsNode = { kind: "file", content, mode: existing?.mode ?? 0o644 };
  const updated = setNode(root, parts, node);
  return updated === undefined
    ? { error: `${target}: No such file or directory` }
    : { root: updated };
}

function runSimple(
  command: SimpleCommand,
  stdinText: string,
  piped: boolean,
  run: Run,
): { stdout: string; status: number } {
  const ctx = (): ExpandContext => ({
    root: run.root,
    cwd: run.cwd,
    env: run.env,
    status: run.status,
  });
  let stdin = stdinText;

  // Redirections are processed left to right before the command runs, as in bash.
  let outTarget: { path: string; append: boolean } | null = null;
  for (const redirect of command.redirects) {
    const targets = expandWord(redirect.target, ctx());
    if (targets.length !== 1) {
      run.output += bash(`${redirect.target.map((s) => s.text).join("")}: ambiguous redirect`);
      return { stdout: "", status: 1 };
    }
    const path = targets[0] as string;
    if (redirect.kind === "in") {
      const node = getNode(run.root, resolveParts(run.cwd, path));
      if (node === undefined) {
        run.output += bash(`${path}: No such file or directory`);
        return { stdout: "", status: 1 };
      }
      if (node.kind === "dir" || !canRead(node)) {
        run.output += bash(
          `${path}: ${node.kind === "dir" ? "Is a directory" : "Permission denied"}`,
        );
        return { stdout: "", status: 1 };
      }
      stdin = node.content;
    } else {
      // The file is created (or emptied) even if the command then fails.
      const written = writeTo(run.root, run.cwd, path, "", redirect.append);
      if ("error" in written) {
        run.output += bash(written.error);
        return { stdout: "", status: 1 };
      }
      run.root = written.root;
      outTarget = { path, append: true };
    }
  }

  const words = expandWords(command.words, ctx());
  let result: CommandResult;
  const assignment = (word: string) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
  if (words.length === 0) {
    result = ok();
  } else if (
    words.every(assignment) ||
    (words[0] === "export" &&
      words.slice(1).every((w) => assignment(w) || /^[A-Za-z_]\w*$/.test(w)))
  ) {
    // `NAME=value` and `export NAME=value`: variables live in the environment.
    const env = { ...run.env };
    for (const word of words) {
      if (!assignment(word)) continue;
      const at = word.indexOf("=");
      env[word.slice(0, at)] = word.slice(at + 1);
    }
    result = ok("", { env });
  } else {
    const [name, ...args] = words as [string, ...string[]];
    if (name === "cd") {
      result = changeDirectory(args, run);
      // In a pipeline `cd` runs in a subshell, so it changes nothing outside it.
      if (piped) result = { ...result, cwd: undefined, env: undefined } as CommandResult;
    } else if (name.includes("/")) {
      const node = getNode(run.root, resolveParts(run.cwd, name));
      if (node === undefined) result = failure(`bash: ${name}: No such file or directory`, 127);
      else if (node.kind === "dir") result = failure(`bash: ${name}: Is a directory`, 126);
      else if ((node.mode & 0o100) === 0) result = failure(`bash: ${name}: Permission denied`, 126);
      else result = ok(); // Running scripts is not simulated; the file system effects are what count.
    } else {
      const command = COMMANDS[name];
      result = command
        ? command({ args, stdin, root: run.root, cwd: run.cwd, env: run.env })
        : failure(`bash: ${name}: command not found`, 127);
    }
  }

  if (result.root) run.root = result.root;
  if (result.cwd) run.cwd = result.cwd;
  if (result.env) run.env = result.env;
  run.output += result.stderr;

  if (outTarget) {
    const written = writeTo(run.root, run.cwd, outTarget.path, result.stdout, true);
    if ("root" in written) run.root = written.root;
    return { stdout: "", status: result.status };
  }
  return { stdout: result.stdout, status: result.status };
}

function runPipeline(pipeline: Pipeline, run: Run): void {
  let carried = "";
  const piped = pipeline.commands.length > 1;
  pipeline.commands.forEach((command, index) => {
    const { stdout, status } = runSimple(command, carried, piped, run);
    const last = index === pipeline.commands.length - 1;
    if (last) run.output += stdout;
    carried = stdout;
    run.status = status;
  });
}

/** Runs one command line against the state and returns the new state with its output. */
export function runCommandLine(state: ShellState, text: string): ShellState {
  const prompt = promptOf(state);
  const run: Run = {
    root: state.root,
    cwd: state.cwd,
    env: state.env,
    status: state.status,
    output: "",
  };

  const parsed = parse(text);
  if (!parsed.ok) {
    run.output += bash(parsed.message);
    run.status = 2;
  } else if (parsed.list) {
    runPipeline(parsed.list.first, run);
    for (const { connector, pipeline } of parsed.list.rest) {
      if (connector === "&&" && run.status !== 0) continue;
      if (connector === "||" && run.status === 0) continue;
      runPipeline(pipeline, run);
    }
  }

  return {
    ...state,
    root: run.root,
    cwd: run.cwd,
    env: run.env,
    status: run.status,
    line: "",
    history: text.trim() === "" ? state.history : [...state.history, text],
    historyIndex: null,
    transcript: [...state.transcript, { prompt, command: text, output: run.output }],
  };
}

export { q };
