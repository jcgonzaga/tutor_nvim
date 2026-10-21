import {
  DEFAULT_DIR_MODE,
  emptyDir,
  file,
  getNode,
  joinPath,
  modeString,
  removeNode,
  resolveParts,
  setNode,
  sizeOf,
  sortedNames,
  type DirNode,
  type FsNode,
} from "../fs";
import {
  failure,
  missingOperand,
  ok,
  parseArgs,
  q,
  usageError,
  type Command,
  type CommandResult,
} from "./types";

const basename = (path: string): string => {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || "/";
};

/** Reading and writing are checked against the owner bits: the learner owns every file. */
export const canRead = (node: FsNode): boolean => (node.mode & 0o400) !== 0;
export const canWrite = (node: FsNode): boolean => (node.mode & 0o200) !== 0;

/** Collects the stderr lines and the final status of a command that handles several operands. */
class Tally {
  stderr = "";
  status = 0;
  error(message: string, status = 1): void {
    this.stderr += `${message}\n`;
    this.status = Math.max(this.status, status) || status;
  }
}

export const mkdir: Command = ({ args, root, cwd }) => {
  const parsed = parseArgs(args, "pv");
  if (parsed.invalid) return usageError("mkdir", parsed.invalid);
  if (parsed.operands.length === 0) return missingOperand("mkdir");
  const parents = parsed.flags.has("p");
  const verbose = parsed.flags.has("v");
  const tally = new Tally();
  let out = "";
  let tree = root;
  for (const operand of parsed.operands) {
    const parts = resolveParts(cwd, operand);
    const existing = getNode(tree, parts);
    if (existing !== undefined) {
      if (!parents || existing.kind !== "dir") {
        tally.error(`mkdir: cannot create directory ${q(operand)}: File exists`);
      }
      continue;
    }
    const missingFrom = parts.findIndex(
      (_, i) => getNode(tree, parts.slice(0, i + 1)) === undefined,
    );
    if (missingFrom < parts.length - 1 && !parents) {
      tally.error(`mkdir: cannot create directory ${q(operand)}: No such file or directory`);
      continue;
    }
    let next: DirNode | undefined = tree;
    for (let depth = missingFrom + 1; depth <= parts.length; depth++) {
      const prefix = parts.slice(0, depth);
      const parent = getNode(next as DirNode, prefix.slice(0, -1));
      if (parent?.kind !== "dir") {
        next = undefined;
        break;
      }
      next = setNode(next as DirNode, prefix, emptyDir(DEFAULT_DIR_MODE));
      if (next === undefined) break;
      if (verbose)
        out += `mkdir: created directory ${q(depth === parts.length ? operand : joinPath(prefix).slice(1))}\n`;
    }
    if (next === undefined) {
      tally.error(`mkdir: cannot create directory ${q(operand)}: Not a directory`);
    } else tree = next;
  }
  return { stdout: out, stderr: tally.stderr, status: tally.status, root: tree };
};

export const touch: Command = ({ args, root, cwd }) => {
  const parsed = parseArgs(args, "");
  if (parsed.invalid) return usageError("touch", parsed.invalid);
  if (parsed.operands.length === 0) {
    return failure("touch: missing file operand\nTry 'touch --help' for more information.");
  }
  const tally = new Tally();
  let tree = root;
  for (const operand of parsed.operands) {
    const parts = resolveParts(cwd, operand);
    if (getNode(tree, parts) !== undefined) continue; // timestamps are not modelled
    const parent = getNode(tree, parts.slice(0, -1));
    if (parent === undefined) {
      tally.error(`touch: cannot touch ${q(operand)}: No such file or directory`);
    } else if (parent.kind !== "dir") {
      tally.error(`touch: cannot touch ${q(operand)}: Not a directory`);
    } else tree = setNode(tree, parts, file()) ?? tree;
  }
  return { stdout: "", stderr: tally.stderr, status: tally.status, root: tree };
};

function copyOrMove(program: "cp" | "mv"): Command {
  return ({ args, root, cwd }) => {
    const parsed = parseArgs(args, program === "cp" ? "rRfv" : "fnv");
    if (parsed.invalid) return usageError(program, parsed.invalid);
    const recursive = parsed.flags.has("r") || parsed.flags.has("R");
    const { operands } = parsed;
    if (operands.length === 0) {
      return failure(
        `${program}: missing file operand\nTry '${program} --help' for more information.`,
      );
    }
    if (operands.length === 1) return missingOperand(program, operands[0]);
    const sources = operands.slice(0, -1);
    const target = operands[operands.length - 1] as string;
    const targetParts = resolveParts(cwd, target);
    const targetNode = getNode(root, targetParts);
    const targetIsDir = targetNode?.kind === "dir";
    if (sources.length > 1 && !targetIsDir) {
      return failure(
        `${program}: target ${q(target)}: ${targetNode ? "Not a directory" : "No such file or directory"}`,
      );
    }
    const tally = new Tally();
    let tree = root;
    let out = "";
    for (const source of sources) {
      const sourceParts = resolveParts(cwd, source);
      const node = getNode(tree, sourceParts);
      if (node === undefined) {
        tally.error(`${program}: cannot stat ${q(source)}: No such file or directory`);
        continue;
      }
      const destParts = targetIsDir ? [...targetParts, basename(source)] : targetParts;
      const destShown = targetIsDir ? `${target.replace(/\/+$/, "")}/${basename(source)}` : target;
      if (joinPath(sourceParts) === joinPath(destParts)) {
        tally.error(`${program}: ${q(source)} and ${q(destShown)} are the same file`);
        continue;
      }
      const destParent = getNode(tree, destParts.slice(0, -1));
      if (destParent === undefined) {
        tally.error(
          `${program}: cannot create ${node.kind === "dir" ? "directory" : "regular file"} ${q(destShown)}: No such file or directory`,
        );
        continue;
      }
      if (destParent.kind !== "dir") {
        tally.error(
          `${program}: cannot create ${node.kind === "dir" ? "directory" : "regular file"} ${q(destShown)}: Not a directory`,
        );
        continue;
      }
      const existing = getNode(tree, destParts);
      if (program === "cp") {
        if (node.kind === "dir" && !recursive) {
          tally.error(`cp: -r not specified; omitting directory ${q(source)}`);
          continue;
        }
        if (node.kind === "file" && !canRead(node)) {
          tally.error(`cp: cannot open ${q(source)} for reading: Permission denied`);
          continue;
        }
        if (existing?.kind === "dir" && node.kind === "file") {
          tally.error(`cp: cannot overwrite directory ${q(destShown)} with non-directory`);
          continue;
        }
        if (existing?.kind === "file" && node.kind === "dir") {
          tally.error(
            `cp: cannot overwrite non-directory ${q(destShown)} with directory ${q(source)}`,
          );
          continue;
        }
        if (node.kind === "dir" && destParts.join("/").startsWith(`${sourceParts.join("/")}/`)) {
          tally.error(`cp: cannot copy a directory, ${q(source)}, into itself, ${q(destShown)}`);
          continue;
        }
        if (existing?.kind === "file" && !canWrite(existing)) {
          tally.error(`cp: cannot create regular file ${q(destShown)}: Permission denied`);
          continue;
        }
        tree = setNode(tree, destParts, node) ?? tree;
        if (parsed.flags.has("v")) out += `${q(source)} -> ${q(destShown)}\n`;
      } else {
        if (node.kind === "dir" && destParts.join("/").startsWith(`${sourceParts.join("/")}/`)) {
          tally.error(`mv: cannot move ${q(source)} to a subdirectory of itself, ${q(destShown)}`);
          continue;
        }
        if (existing?.kind === "dir" && node.kind === "file") {
          tally.error(`mv: cannot overwrite directory ${q(destShown)} with non-directory`);
          continue;
        }
        if (existing?.kind === "file" && node.kind === "dir") {
          tally.error(
            `mv: cannot overwrite non-directory ${q(destShown)} with directory ${q(source)}`,
          );
          continue;
        }
        if (existing?.kind === "dir" && Object.keys(existing.children).length > 0) {
          tally.error(`mv: cannot move ${q(source)} to ${q(destShown)}: Directory not empty`);
          continue;
        }
        tree = removeNode(tree, sourceParts);
        tree = setNode(tree, destParts, node) ?? tree;
        if (parsed.flags.has("v")) out += `renamed ${q(source)} -> ${q(destShown)}\n`;
      }
    }
    return { stdout: out, stderr: tally.stderr, status: tally.status, root: tree };
  };
}
export const cp = copyOrMove("cp");
export const mv = copyOrMove("mv");

export const rm: Command = ({ args, root, cwd }) => {
  const parsed = parseArgs(args, "rRfdv");
  if (parsed.invalid) return usageError("rm", parsed.invalid);
  const recursive = parsed.flags.has("r") || parsed.flags.has("R");
  const force = parsed.flags.has("f");
  if (parsed.operands.length === 0) {
    return force ? ok() : failure("rm: missing operand\nTry 'rm --help' for more information.");
  }
  const tally = new Tally();
  let out = "";
  let tree = root;
  for (const operand of parsed.operands) {
    const base = basename(operand);
    if (base === "." || base === "..") {
      tally.error(`rm: refusing to remove '.' or '..' directory: skipping ${q(operand)}`);
      continue;
    }
    const parts = resolveParts(cwd, operand);
    const node = getNode(tree, parts);
    if (parts.length === 0) {
      tally.error(
        "rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe",
      );
      continue;
    }
    if (node === undefined) {
      if (!force) tally.error(`rm: cannot remove ${q(operand)}: No such file or directory`);
      continue;
    }
    if (node.kind === "dir" && !recursive && !parsed.flags.has("d")) {
      tally.error(`rm: cannot remove ${q(operand)}: Is a directory`);
      continue;
    }
    if (node.kind === "dir" && !recursive && Object.keys(node.children).length > 0) {
      tally.error(`rm: cannot remove ${q(operand)}: Directory not empty`);
      continue;
    }
    tree = removeNode(tree, parts);
    if (parsed.flags.has("v"))
      out += `removed ${node.kind === "dir" ? "directory " : ""}${q(operand)}\n`;
  }
  return { stdout: out, stderr: tally.stderr, status: tally.status, root: tree };
};

/** Applies a chmod mode (octal or symbolic) to `current`; `null` if the mode is invalid. */
export function applyMode(spec: string, current: number, isDir: boolean): number | null {
  if (/^[0-7]{1,4}$/.test(spec)) return Number.parseInt(spec, 8) & 0o7777;
  let mode = current;
  const umask = 0o022;
  for (const clause of spec.split(",")) {
    const match = /^([ugoa]*)([-+=])([rwxXst]*)$/.exec(clause);
    if (!match) return null;
    const [, whoRaw = "", operator = "", permsRaw = ""] = match;
    const who = whoRaw === "" ? "a" : whoRaw;
    const classes = who.includes("a") ? "ugo" : who;
    let bits = 0;
    for (const p of permsRaw) {
      if (p === "r") bits |= 4;
      if (p === "w") bits |= 2;
      if (p === "x") bits |= 1;
      if (p === "X" && (isDir || (current & 0o111) !== 0)) bits |= 1;
    }
    let mask = 0;
    for (const c of classes) mask |= (bits << (c === "u" ? 6 : c === "g" ? 3 : 0)) & 0o777;
    // Without an explicit class, bits cleared by the umask stay clear (`chmod +w` on 644 -> 644 for others).
    if (whoRaw === "") mask &= ~umask;
    if (operator === "+") mode |= mask;
    else if (operator === "-") mode &= ~mask;
    else {
      let clear = 0;
      for (const c of classes) clear |= 0o7 << (c === "u" ? 6 : c === "g" ? 3 : 0);
      if (whoRaw === "") clear &= ~umask;
      mode = (mode & ~clear) | mask;
    }
  }
  return mode;
}

export const chmod: Command = ({ args, root, cwd }) => {
  const parsed = parseArgs(args, "Rv");
  // A leading `-x` style symbolic mode (`chmod -x file`) looks like an option; treat it as the mode.
  let operands = parsed.operands;
  let invalidOption = parsed.invalid;
  const recursive = parsed.flags.has("R");
  if (invalidOption !== null && /^-[rwxXst]+$/.test(invalidOption) && operands.length > 0) {
    operands = [invalidOption, ...operands];
    invalidOption = null;
  }
  if (invalidOption) return usageError("chmod", invalidOption);
  if (operands.length === 0) {
    return failure("chmod: missing operand\nTry 'chmod --help' for more information.");
  }
  const [spec, ...targets] = operands as [string, ...string[]];
  if (targets.length === 0) {
    return failure(
      `chmod: missing operand after ${q(spec)}\nTry 'chmod --help' for more information.`,
    );
  }
  if (applyMode(spec, 0o644, false) === null) {
    return failure(`chmod: invalid mode: ${q(spec)}\nTry 'chmod --help' for more information.`);
  }
  const tally = new Tally();
  let tree = root;
  const apply = (node: FsNode): FsNode => {
    const mode = applyMode(spec, node.mode, node.kind === "dir") ?? node.mode;
    if (node.kind === "file") return { ...node, mode };
    return {
      ...node,
      mode,
      children: recursive
        ? Object.fromEntries(
            Object.entries(node.children).map(([name, child]) => [name, apply(child)]),
          )
        : node.children,
    };
  };
  for (const target of targets) {
    const parts = resolveParts(cwd, target);
    const node = getNode(tree, parts);
    if (node === undefined) {
      tally.error(`chmod: cannot access ${q(target)}: No such file or directory`);
      continue;
    }
    tree =
      parts.length === 0 ? (apply(node) as DirNode) : (setNode(tree, parts, apply(node)) ?? tree);
  }
  return { stdout: "", stderr: tally.stderr, status: tally.status, root: tree };
};

/** Block count as `ls -l` totals show it (1 KiB units, files rounded up to 4 KiB). */
const blocks = (node: FsNode): number =>
  node.kind === "dir" ? 4 : sizeOf(node) === 0 ? 0 : Math.ceil(sizeOf(node) / 4096) * 4;

export const ls: Command = ({ args, root, cwd }) => {
  const parsed = parseArgs(args, "alA1Rd");
  if (parsed.invalid) return usageError("ls", parsed.invalid);
  const long = parsed.flags.has("l");
  const all = parsed.flags.has("a");
  const almostAll = parsed.flags.has("A");
  const recursive = parsed.flags.has("R");
  const listDirs = parsed.flags.has("d");
  const operands = parsed.operands.length > 0 ? parsed.operands : ["."];

  let stderr = "";
  let status = 0;

  const line = (name: string, node: FsNode, widths: { links: number; size: number }): string => {
    if (!long) return name;
    const links =
      node.kind === "dir"
        ? 2 + Object.values(node.children).filter((child) => child.kind === "dir").length
        : 1;
    return `${modeString(node)} ${String(links).padStart(widths.links)} user user ${String(sizeOf(node)).padStart(widths.size)} Jan  1 00:00 ${name}`;
  };
  const widthsOf = (entries: readonly (readonly [string, FsNode])[]) => ({
    links: Math.max(
      1,
      ...entries.map(
        ([, n]) =>
          String(
            n.kind === "dir"
              ? 2 + Object.values(n.children).filter((c) => c.kind === "dir").length
              : 1,
          ).length,
      ),
    ),
    size: Math.max(1, ...entries.map(([, n]) => String(sizeOf(n)).length)),
  });
  const entriesOf = (dir: DirNode, parent: DirNode = dir): [string, FsNode][] => {
    const names = sortedNames(dir).filter((name) => all || almostAll || !name.startsWith("."));
    const entries: [string, FsNode][] = names.map((name) => [name, dir.children[name] as FsNode]);
    if (all) entries.unshift([".", dir], ["..", parent]);
    return entries;
  };
  const render = (entries: readonly (readonly [string, FsNode])[], withTotal: boolean): string => {
    const widths = widthsOf(entries);
    const head =
      long && withTotal ? `total ${entries.reduce((sum, [, n]) => sum + blocks(n), 0)}\n` : "";
    return head + entries.map(([name, node]) => `${line(name, node, widths)}\n`).join("");
  };

  const files: [string, FsNode][] = [];
  const dirs: [string, DirNode, DirNode][] = [];
  for (const operand of [...operands].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const node = getNode(root, resolveParts(cwd, operand));
    if (node === undefined) {
      stderr += `ls: cannot access ${q(operand)}: No such file or directory\n`;
      status = 2;
    } else if (node.kind === "dir" && !listDirs) {
      const parentNode = getNode(root, resolveParts(cwd, operand).slice(0, -1));
      dirs.push([operand, node, parentNode?.kind === "dir" ? parentNode : node]);
    } else files.push([operand, node]);
  }

  const sections: string[] = [];
  if (files.length > 0) sections.push(render(files, false));
  const walk = (label: string, dir: DirNode, display: string, parent: DirNode = dir): void => {
    const header = operands.length > 1 || recursive || files.length > 0 ? `${display}:\n` : "";
    sections.push(header + render(entriesOf(dir, parent), true));
    if (recursive) {
      for (const [name, child] of entriesOf(dir)) {
        if (child.kind === "dir" && name !== "." && name !== "..") {
          walk(
            label,
            child,
            display === "." ? `./${name}` : `${display.replace(/\/$/, "")}/${name}`,
            dir,
          );
        }
      }
    }
  };
  for (const [operand, dir, parent] of dirs) walk(operand, dir, operand, parent);
  return { stdout: sections.join("\n"), stderr, status };
};

export const cat: Command = ({ args, stdin, root, cwd }) => {
  const parsed = parseArgs(args, "n");
  if (parsed.invalid) return usageError("cat", parsed.invalid);
  const number = parsed.flags.has("n");
  const operands = parsed.operands.length > 0 ? parsed.operands : ["-"];
  const tally = new Tally();
  let out = "";
  for (const operand of operands) {
    if (operand === "-") {
      out += stdin;
      continue;
    }
    const node = getNode(root, resolveParts(cwd, operand));
    if (node === undefined) tally.error(`cat: ${operand}: No such file or directory`);
    else if (node.kind === "dir") tally.error(`cat: ${operand}: Is a directory`);
    else if (!canRead(node)) tally.error(`cat: ${operand}: Permission denied`);
    else out += node.content;
  }
  if (number) {
    let n = 0;
    const lines = out.split("\n");
    const trailing = out.endsWith("\n");
    if (trailing) lines.pop();
    out =
      lines.map((text) => `${String(++n).padStart(6)}\t${text}`).join("\n") +
      (trailing ? "\n" : "");
  }
  return { stdout: out, stderr: tally.stderr, status: tally.status };
};

export const pwd: Command = ({ cwd }) => ok(`${joinPath(cwd)}\n`);

export const echo: Command = ({ args }) => {
  let rest = [...args];
  let newline = true;
  while (rest[0] === "-n") {
    newline = false;
    rest = rest.slice(1);
  }
  return ok(rest.join(" ") + (newline ? "\n" : ""));
};

export type { CommandResult };
