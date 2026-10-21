import { getNode, resolveParts, sortedNames, type DirNode, type FsNode } from "../fs";
import { canRead } from "./files";
import { failure, parseArgs, q, usageError, type Command } from "./types";

/**
 * Translates a POSIX basic regular expression (grep's default) into a JavaScript one. In a BRE,
 * `+ ? | ( ) { }` are literal and their backslashed forms are the operators.
 */
function breToJs(pattern: string): string {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] as string;
    if (c === "\\" && i + 1 < pattern.length) {
      const next = pattern[++i] as string;
      out += "(){}+?|".includes(next) ? next : `\\${next}`;
    } else if ("(){}+?|".includes(c)) out += `\\${c}`;
    else out += c;
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");
}

const eachFile = (root: DirNode, parts: readonly string[], shown: string): [string, FsNode][] => {
  const node = getNode(root, parts);
  if (node === undefined) return [];
  if (node.kind === "file") return [[shown, node]];
  const out: [string, FsNode][] = [];
  const walk = (dir: DirNode, prefix: string): void => {
    for (const name of sortedNames(dir)) {
      const child = dir.children[name] as FsNode;
      const path = prefix === "" ? name : `${prefix}/${name}`;
      if (child.kind === "dir") walk(child, path);
      else out.push([path, child]);
    }
  };
  walk(node, shown);
  return out;
};

export const grep: Command = ({ args, stdin, root, cwd }) => {
  const parsed = parseArgs(args, "invcrRlEFwHhq", {
    valued: "e",
    long: { recursive: "r", "ignore-case": "i" },
  });
  if (parsed.invalid) return usageError("grep", parsed.invalid);
  const flags = parsed.flags;
  const operands = [...parsed.operands];
  const patternText = parsed.values.e ?? operands.shift();
  if (patternText === undefined) {
    return failure(
      "Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.",
      2,
    );
  }
  let source: string;
  if (flags.has("F")) source = escapeRegExp(patternText);
  else if (flags.has("E")) source = patternText;
  else source = breToJs(patternText);
  if (flags.has("w")) source = `\\b(?:${source})\\b`;
  let regexp: RegExp;
  try {
    regexp = new RegExp(source, flags.has("i") ? "i" : "");
  } catch {
    return failure(`grep: Invalid regular expression`, 2);
  }

  const recursive = flags.has("r") || flags.has("R");
  const invert = flags.has("v");
  let stderr = "";
  let status = 1;
  let hadError = false;

  // Where input comes from: [name shown in output, text].
  const inputs: [string, string][] = [];
  let showNames = false;
  if (operands.length === 0 && !recursive) {
    inputs.push(["(standard input)", stdin]);
  } else {
    const targets = operands.length > 0 ? operands : ["."];
    showNames = (operands.length > 1 || recursive) && !flags.has("h");
    if (flags.has("H")) showNames = true;
    for (const target of targets) {
      const parts = resolveParts(cwd, target);
      const node = getNode(root, parts);
      if (node === undefined) {
        stderr += `grep: ${target}: No such file or directory\n`;
        hadError = true;
      } else if (node.kind === "dir") {
        if (!recursive) {
          stderr += `grep: ${target}: Is a directory\n`;
          hadError = true;
          continue;
        }
        // `grep -r pat` (no operand) prints bare names; `grep -r pat .` prints `./name`.
        const prefix = operands.length === 0 ? "" : target.replace(/\/+$/, "");
        for (const [path, child] of eachFile(root, parts, "")) {
          const shown = prefix === "" ? path : `${prefix}/${path}`;
          if (child.kind === "file" && canRead(child)) inputs.push([shown, child.content]);
          else if (child.kind === "file") {
            stderr += `grep: ${shown}: Permission denied\n`;
            hadError = true;
          }
        }
      } else if (!canRead(node)) {
        stderr += `grep: ${target}: Permission denied\n`;
        hadError = true;
      } else inputs.push([target, node.content]);
    }
  }

  let out = "";
  for (const [name, text] of inputs) {
    const lines = text.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    let count = 0;
    let matchedAny = false;
    lines.forEach((content, index) => {
      if (regexp.test(content) === invert) return;
      count++;
      matchedAny = true;
      if (flags.has("c") || flags.has("l") || flags.has("q")) return;
      out += `${showNames ? `${name}:` : ""}${flags.has("n") ? `${index + 1}:` : ""}${content}\n`;
    });
    if (flags.has("c")) out += `${showNames ? `${name}:` : ""}${count}\n`;
    if (flags.has("l") && matchedAny) out += `${name}\n`;
    if (matchedAny) status = 0;
  }
  if (flags.has("q")) out = "";
  if (hadError && !(flags.has("q") && status === 0)) status = 2;
  return { stdout: out, stderr, status };
};

function textOf(
  program: string,
  operands: readonly string[],
  stdin: string,
  root: DirNode,
  cwd: readonly string[],
): { inputs: [string, string][]; stderr: string; status: number } {
  if (operands.length === 0) return { inputs: [["", stdin]], stderr: "", status: 0 };
  const inputs: [string, string][] = [];
  let stderr = "";
  let status = 0;
  for (const operand of operands) {
    const node = operand === "-" ? undefined : getNode(root, resolveParts(cwd, operand));
    if (operand === "-") inputs.push([operand, stdin]);
    else if (node === undefined) {
      stderr += `${program}: ${operand}: No such file or directory\n`;
      status = 1;
    } else if (node.kind === "dir") {
      stderr += `${program}: ${operand}: Is a directory\n`;
      status = 1;
    } else if (!canRead(node)) {
      stderr += `${program}: ${operand}: Permission denied\n`;
      status = 1;
    } else inputs.push([operand, node.content]);
  }
  return { inputs, stderr, status };
}

export const wc: Command = ({ args, stdin, root, cwd }) => {
  const parsed = parseArgs(args, "lwc");
  if (parsed.invalid) return usageError("wc", parsed.invalid);
  const { inputs, stderr, status } = textOf("wc", parsed.operands, stdin, root, cwd);
  const none = !parsed.flags.has("l") && !parsed.flags.has("w") && !parsed.flags.has("c");
  const counts = inputs.map(([name, text]) => ({
    name,
    l: (text.match(/\n/g) ?? []).length,
    w: text.split(/\s+/).filter(Boolean).length,
    c: new TextEncoder().encode(text).length,
  }));
  const rows = [...counts];
  if (counts.length > 1) {
    rows.push({ name: "total", l: sum(counts, "l"), w: sum(counts, "w"), c: sum(counts, "c") });
  }
  const columns = (["l", "w", "c"] as const).filter((k) => none || parsed.flags.has(k));
  // GNU wc pads every number to a common width (the widest count, at least 1 for one column).
  const width =
    columns.length === 1 && parsed.operands.length <= 1
      ? 0
      : Math.max(1, ...rows.flatMap((row) => columns.map((k) => String(row[k]).length)));
  const out = rows
    .map(
      (row) =>
        `${columns.map((k) => String(row[k]).padStart(width)).join(" ")}${row.name ? ` ${row.name}` : ""}\n`,
    )
    .join("");
  return { stdout: out, stderr, status };
};
const sum = (rows: readonly { l: number; w: number; c: number }[], key: "l" | "w" | "c"): number =>
  rows.reduce((total, row) => total + row[key], 0);

function headTail(program: "head" | "tail"): Command {
  return ({ args, stdin, root, cwd }) => {
    // `-n 3`, `-n3` and the old `-3` spelling.
    const normalized = args.map((arg) => (/^-\d+$/.test(arg) ? `-n${arg.slice(1)}` : arg));
    const parsed = parseArgs(normalized, "", { valued: "n" });
    if (parsed.invalid) return usageError(program, parsed.invalid);
    const raw = parsed.values.n ?? "10";
    if (!/^\d+$/.test(raw)) return failure(`${program}: invalid number of lines: ${q(raw)}`);
    const n = Number(raw);
    const { inputs, stderr, status } = textOf(program, parsed.operands, stdin, root, cwd);
    let out = "";
    inputs.forEach(([name, text], index) => {
      if (inputs.length > 1) out += `${index > 0 ? "\n" : ""}==> ${name} <==\n`;
      const lines = text.split("\n");
      const trailing = lines[lines.length - 1] === "";
      if (trailing) lines.pop();
      const picked = program === "head" ? lines.slice(0, n) : n === 0 ? [] : lines.slice(-n);
      out += picked.map((line) => `${line}\n`).join("");
      if (!trailing && picked.length > 0 && picked[picked.length - 1] === lines[lines.length - 1]) {
        out = out.slice(0, -1);
      }
    });
    return { stdout: out, stderr, status };
  };
}
export const head = headTail("head");
export const tail = headTail("tail");

export const sort: Command = ({ args, stdin, root, cwd }) => {
  const parsed = parseArgs(args, "rnu");
  if (parsed.invalid) return usageError("sort", parsed.invalid);
  const { inputs, stderr, status } = textOf("sort", parsed.operands, stdin, root, cwd);
  let lines = inputs.flatMap(([, text]) => {
    const parts = text.split("\n");
    if (parts[parts.length - 1] === "") parts.pop();
    return parts;
  });
  const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const leadingNumber = (s: string) =>
    Number.parseFloat(/^\s*(-?\d+(?:\.\d+)?)/.exec(s)?.[1] ?? "0");
  lines.sort(
    parsed.flags.has("n")
      ? (a, b) => leadingNumber(a) - leadingNumber(b) || byBytes(a, b)
      : byBytes,
  );
  if (parsed.flags.has("r")) lines.reverse();
  if (parsed.flags.has("u")) lines = lines.filter((line, i) => i === 0 || line !== lines[i - 1]);
  return { stdout: lines.map((line) => `${line}\n`).join(""), stderr, status };
};

const globToRegExp = (pattern: string, ignoreCase: boolean): RegExp => {
  let source = "";
  for (const c of pattern) {
    if (c === "*") source += ".*";
    else if (c === "?") source += ".";
    else source += escapeRegExp(c);
  }
  return new RegExp(`^${source}$`, ignoreCase ? "i" : "");
};

export const find: Command = ({ args, root, cwd }) => {
  const paths: string[] = [];
  let i = 0;
  while (i < args.length && !(args[i] as string).startsWith("-")) paths.push(args[i++] as string);
  let name: RegExp | null = null;
  let type: "f" | "d" | null = null;
  let maxDepth = Number.POSITIVE_INFINITY;
  let minDepth = 0;
  for (; i < args.length; i++) {
    const option = args[i] as string;
    const value = args[i + 1];
    if (option === "-name" || option === "-iname") {
      if (value === undefined) return failure(`find: missing argument to ${q(option)}`);
      name = globToRegExp(value, option === "-iname");
      i++;
    } else if (option === "-type") {
      if (value !== "f" && value !== "d")
        return failure(`find: Unknown argument to -type: ${value ?? ""}`);
      type = value;
      i++;
    } else if (option === "-maxdepth" || option === "-mindepth") {
      if (value === undefined || !/^\d+$/.test(value))
        return failure(`find: invalid argument ${q(value ?? "")} to ${q(option)}`);
      if (option === "-maxdepth") maxDepth = Number(value);
      else minDepth = Number(value);
      i++;
    } else if (option === "-print") {
      // The default action.
    } else {
      return failure(`find: unknown predicate ${q(option)}`);
    }
  }
  let stdout = "";
  let stderr = "";
  let status = 0;
  const visit = (node: FsNode, shown: string, depth: number): void => {
    const matches =
      depth >= minDepth &&
      (type === null || (type === "d") === (node.kind === "dir")) &&
      (name === null || name.test(shown.slice(shown.lastIndexOf("/") + 1)));
    if (matches) stdout += `${shown}\n`;
    if (node.kind === "dir" && depth < maxDepth) {
      for (const child of sortedNames(node)) {
        visit(
          node.children[child] as FsNode,
          shown === "/" ? `/${child}` : `${shown}/${child}`,
          depth + 1,
        );
      }
    }
  };
  for (const start of paths.length > 0 ? paths : ["."]) {
    const node = getNode(root, resolveParts(cwd, start));
    if (node === undefined) {
      stderr += `find: ${q(start)}: No such file or directory\n`;
      status = 1;
    } else visit(node, start, 0);
  }
  return { stdout, stderr, status };
};
