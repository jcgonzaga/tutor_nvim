import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  getNode,
  initShell,
  runCommandLine,
  sortedNames,
  type DirNode,
  type FsNode,
  type ShellState,
} from "./index";

/**
 * Runs the same command lines in real bash and in the simulator and reports every difference.
 * Real bash works inside a throw-away directory that plays the role of `/` (`<sandbox>/home/user`
 * is the home directory), so scenarios must not step outside it with absolute paths.
 */
export interface Scenario {
  readonly name: string;
  readonly files?: Readonly<Record<string, string>>;
  /** Files whose mode differs from the default 644 (octal). */
  readonly modes?: Readonly<Record<string, number>>;
  readonly lines: readonly string[];
}

export interface LineResult {
  readonly line: string;
  readonly output: string;
  readonly status: number;
}

export interface Snapshot {
  readonly [path: string]: string;
}

/** `ls -l` prints the owner, group and date of the machine; the simulator's are fixed. */
const normalizeLong = (text: string): string =>
  text
    .split("\n")
    .map((row) =>
      row
        .replace(
          /^([-d][-rwx]{9}) +(\d+) +\S+ +\S+ +(\d+) +\w{3} +\d+ +[\d:]+ /,
          "$1 $2 user user $3 Jan 1 00:00 ",
        )
        .replace(/ +/g, " "),
    )
    .join("\n");

export const sandboxHome = (root: string): string => join(root, "home", "user");

export function runReal(scenario: Scenario): {
  results: LineResult[];
  files: Snapshot;
  root: string;
} {
  const root = mkdtempSync(join(tmpdir(), "shell-oracle-"));
  const home = sandboxHome(root);
  mkdirSync(home, { recursive: true });
  for (const [path, content] of Object.entries(scenario.files ?? {})) {
    if (path.endsWith("/")) {
      mkdirSync(join(home, path), { recursive: true });
    } else {
      mkdirSync(dirname(join(home, path)), { recursive: true });
      writeFileSync(join(home, path), content);
    }
  }
  for (const [path, mode] of Object.entries(scenario.modes ?? {}))
    chmodSync(join(home, path), mode);

  const marker = "@@END@@";
  const script = [
    `cd "${home}"`,
    // Record the status without disturbing `$?`, which the next line may read.
    ...scenario.lines.flatMap((line) => [line, `__s=$?; echo "${marker}$__s"; (exit $__s)`]),
  ].join("\n");
  // Root ignores permission bits, which would hide the behaviour the exercises teach: when the
  // tests run as root, bash runs as `nobody` inside the sandbox instead.
  const asRoot = process.getuid?.() === 0;
  if (asRoot) {
    spawnSync("chown", ["-R", "65534:65534", root]);
    chmodSync(root, 0o755);
  }
  const merged = spawnSync("bash", ["--noprofile", "--norc", "-c", `exec 2>&1\n${script}`], {
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      LC_ALL: "C",
      HOME: home,
      USER: "user",
      PS1: "",
    },
    encoding: "utf8",
    ...(asRoot ? { uid: 65534, gid: 65534 } : {}),
  });
  const results: LineResult[] = [];
  const chunks = merged.stdout.split(marker);
  // chunks: output0, "status0\noutput1", ...
  let outputOf = chunks[0] ?? "";
  for (let i = 0; i < scenario.lines.length; i++) {
    const next = chunks[i + 1] ?? "";
    const newline = next.indexOf("\n");
    const status = Number(newline === -1 ? next : next.slice(0, newline));
    results.push({
      line: scenario.lines[i] as string,
      output: normalizeLong(
        outputOf
          .split(root)
          .join("")
          // `bash -c` adds "line N:" to its messages; an interactive shell does not.
          .replace(/^(?:bash: )?(?:\S+: )?line \d+: /gm, "bash: "),
      ),
      status,
    });
    outputOf = newline === -1 ? "" : next.slice(newline + 1);
  }
  const files: Record<string, string> = {};
  const walk = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const path = `${rel}/${name}`;
      const stat = statSync(full);
      const mode = (stat.mode & 0o777).toString(8).padStart(3, "0");
      if (stat.isDirectory()) {
        files[`${path}/`] = mode;
        walk(full, path);
      } else files[path] = `${mode}:${readFileSync(full, "utf8")}`;
    }
  };
  walk(home, "");
  return { results, files, root };
}

export function runSimulated(scenario: Scenario): { results: LineResult[]; files: Snapshot } {
  let state: ShellState = initShell({
    files: Object.fromEntries(
      Object.entries(scenario.files ?? {}).map(([path, content]) => {
        const mode = scenario.modes?.[path];
        return [path, mode === undefined ? content : { content, mode }];
      }),
    ),
  });
  const results: LineResult[] = [];
  for (const line of scenario.lines) {
    state = runCommandLine(state, line);
    const entry = state.transcript[state.transcript.length - 1];
    results.push({ line, output: normalizeLong(entry?.output ?? ""), status: state.status });
  }
  const files: Record<string, string> = {};
  const home = getNode(state.root, ["home", "user"]) as DirNode;
  const walk = (dir: DirNode, rel: string): void => {
    for (const name of sortedNames(dir)) {
      const node = dir.children[name] as FsNode;
      const path = `${rel}/${name}`;
      const mode = (node.mode & 0o777).toString(8).padStart(3, "0");
      if (node.kind === "dir") {
        files[`${path}/`] = mode;
        walk(node, path);
      } else files[path] = `${mode}:${node.content}`;
    }
  };
  walk(home, "");
  return { results, files };
}

export function cleanup(root: string): void {
  rmSync(root, { recursive: true, force: true });
}
