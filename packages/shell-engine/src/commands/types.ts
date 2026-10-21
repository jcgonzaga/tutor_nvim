import type { DirNode } from "../fs";

/** What a command can see. Commands are pure: they return a new tree instead of mutating one. */
export interface CommandContext {
  readonly args: readonly string[];
  readonly stdin: string;
  readonly root: DirNode;
  readonly cwd: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
  /** The tree after the command; omitted when it changed nothing. */
  readonly root?: DirNode;
  /** Set only by `cd`. */
  readonly cwd?: readonly string[];
  /** Set only by `cd`: becomes `OLDPWD`. */
  readonly env?: Readonly<Record<string, string>>;
}

export type Command = (ctx: CommandContext) => CommandResult;

export const ok = (stdout = "", extra: Partial<CommandResult> = {}): CommandResult => ({
  stdout,
  stderr: "",
  status: 0,
  ...extra,
});

export const failure = (
  stderr: string,
  status = 1,
  extra: Partial<CommandResult> = {},
): CommandResult => ({
  stdout: "",
  stderr: stderr.endsWith("\n") ? stderr : `${stderr}\n`,
  status,
  ...extra,
});

/** GNU coreutils quote operands as 'name' in the C locale; so does the simulator. */
export const q = (name: string): string => `'${name}'`;

export interface ParsedArgs {
  readonly flags: ReadonlySet<string>;
  readonly operands: readonly string[];
  /** Set for an option the command does not know. */
  readonly invalid: string | null;
  /** Values of options that take an argument, e.g. `-n 3`. */
  readonly values: Readonly<Record<string, string>>;
}

/**
 * Splits `-abc` style flags from operands. `valued` lists short options that take an argument
 * (`-n 3` or `-n3`). `--` ends option parsing. Long options are mapped through `long`.
 */
export function parseArgs(
  args: readonly string[],
  known: string,
  options: { valued?: string; long?: Readonly<Record<string, string>> } = {},
): ParsedArgs {
  const flags = new Set<string>();
  const operands: string[] = [];
  const values: Record<string, string> = {};
  let invalid: string | null = null;
  let optionsDone = false;
  const valued = options.valued ?? "";
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (optionsDone || arg === "-" || !arg.startsWith("-")) {
      operands.push(arg);
    } else if (arg === "--") {
      optionsDone = true;
    } else if (arg.startsWith("--")) {
      const mapped = options.long?.[arg.slice(2)];
      if (mapped === undefined) invalid ??= arg;
      else flags.add(mapped);
    } else {
      for (let j = 1; j < arg.length; j++) {
        const c = arg[j] as string;
        if (valued.includes(c)) {
          const inline = arg.slice(j + 1);
          values[c] = inline !== "" ? inline : (args[++i] ?? "");
          break;
        }
        if (known.includes(c)) flags.add(c);
        else invalid ??= `-${c}`;
      }
    }
  }
  return { flags, operands, invalid, values };
}

export const usageError = (program: string, option: string): CommandResult =>
  failure(
    `${program}: invalid option -- '${option.replace(/^-+/, "")}'\nTry '${program} --help' for more information.`,
    program === "grep" ? 2 : 1,
  );

export const missingOperand = (program: string, after?: string): CommandResult =>
  failure(
    after === undefined
      ? `${program}: missing operand\nTry '${program} --help' for more information.`
      : `${program}: missing destination file operand after ${q(after)}\nTry '${program} --help' for more information.`,
  );
