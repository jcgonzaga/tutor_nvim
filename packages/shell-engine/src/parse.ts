/**
 * Command-line parsing for the simulated shell. It covers what the Linux curriculum needs:
 * words with quoting, `|`, `;`, `&&`, `||` and the redirections `<`, `>`, `>>`. Anything else
 * (subshells, `$(...)`, backticks, `&`, here-documents, braces) is reported as unsupported instead
 * of being guessed at.
 */

/** A piece of a word and whether the shell would treat its characters literally. */
export interface Segment {
  readonly text: string;
  /** Quoted segments are not subject to `~`, `$VAR` or glob expansion (`$VAR` still works in "..."). */
  readonly quote: "none" | "single" | "double";
}

export type Word = readonly Segment[];

export type Redirect =
  | { readonly kind: "in"; readonly target: Word }
  | { readonly kind: "out"; readonly target: Word; readonly append: boolean };

export interface SimpleCommand {
  readonly words: readonly Word[];
  readonly redirects: readonly Redirect[];
}

export type Connector = ";" | "&&" | "||";

export interface Pipeline {
  readonly commands: readonly SimpleCommand[];
}

export interface CommandList {
  readonly first: Pipeline;
  readonly rest: readonly { readonly connector: Connector; readonly pipeline: Pipeline }[];
}

export type ParseResult =
  | { readonly ok: true; readonly list: CommandList | null }
  | { readonly ok: false; readonly message: string };

type Token =
  | { readonly type: "word"; readonly word: Word }
  | { readonly type: "op"; readonly op: "|" | ";" | "&&" | "||" | "<" | ">" | ">>" };

const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

function tokenize(line: string): Token[] | { readonly error: string } {
  const tokens: Token[] = [];
  let segments: Segment[] = [];
  let text = "";
  let inWord = false;

  const flushText = (quote: Segment["quote"]) => {
    if (text !== "" || quote !== "none") segments.push({ text, quote });
    text = "";
  };
  const endWord = () => {
    flushText("none");
    if (inWord) tokens.push({ type: "word", word: segments });
    segments = [];
    inWord = false;
  };
  const push = (op: Extract<Token, { type: "op" }>["op"]) => {
    endWord();
    tokens.push({ type: "op", op });
  };

  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (c === " " || c === "\t") {
      endWord();
    } else if (c === "'") {
      flushText("none");
      const end = line.indexOf("'", i + 1);
      if (end === -1) return { error: "unexpected EOF while looking for matching `''" };
      segments.push({ text: line.slice(i + 1, end), quote: "single" });
      inWord = true;
      i = end;
    } else if (c === '"') {
      flushText("none");
      let j = i + 1;
      let value = "";
      for (; j < line.length && line[j] !== '"'; j++) {
        const d = line[j] as string;
        const next = line[j + 1];
        // Inside double quotes a backslash only escapes these characters.
        if (d === "\\" && next !== undefined && '"\\$`'.includes(next)) {
          value += next;
          j++;
        } else value += d;
      }
      if (j >= line.length) return { error: "unexpected EOF while looking for matching `\"'" };
      segments.push({ text: value, quote: "double" });
      inWord = true;
      i = j;
    } else if (c === "\\") {
      const next = line[i + 1];
      if (next === undefined) return { error: "unexpected EOF after a backslash" };
      // An escaped character is literal: model it as a single-quoted segment.
      flushText("none");
      segments.push({ text: next, quote: "single" });
      inWord = true;
      i++;
    } else if (c === "|") {
      if (line[i + 1] === "|") {
        push("||");
        i++;
      } else push("|");
    } else if (c === "&") {
      if (line[i + 1] === "&") {
        push("&&");
        i++;
      } else return { error: "background jobs (&) are not supported here" };
    } else if (c === ";") {
      push(";");
    } else if (c === "<") {
      if (line[i + 1] === "<" || line[i + 1] === "(")
        return { error: "here-documents are not supported here" };
      push("<");
    } else if (c === ">") {
      if (line[i + 1] === ">") {
        push(">>");
        i++;
      } else push(">");
    } else if (c === "$" && line[i + 1] === "{") {
      // `${NAME}` stays in the word; expansion resolves it later.
      const end = line.indexOf("}", i);
      if (end === -1) return { error: "bad substitution" };
      text += line.slice(i, end + 1);
      inWord = true;
      i = end;
    } else if (c === "(" || c === ")" || c === "`" || c === "{" || c === "}") {
      return { error: `syntax not supported here: ${c}` };
    } else if (c === "$" && line[i + 1] === "(") {
      return { error: "command substitution is not supported here" };
    } else {
      text += c;
      inWord = true;
    }
  }
  endWord();
  return tokens;
}

export function parse(line: string): ParseResult {
  const tokens = tokenize(line);
  if (!Array.isArray(tokens)) return fail((tokens as { error: string }).error);
  if (tokens.length === 0) return { ok: true, list: null };

  let position = 0;
  const unexpected = (token: Token | undefined) =>
    fail(
      token === undefined
        ? "syntax error: unexpected end of line"
        : `syntax error near unexpected token \`${token.type === "op" ? token.op : "word"}'`,
    );

  const parseSimple = (): SimpleCommand | { error: ReturnType<typeof fail> } => {
    const words: Word[] = [];
    const redirects: Redirect[] = [];
    for (;;) {
      const token = tokens[position];
      if (token === undefined) break;
      if (token.type === "word") {
        words.push(token.word);
        position++;
      } else if (token.op === "<" || token.op === ">" || token.op === ">>") {
        const target = tokens[position + 1];
        if (target === undefined || target.type !== "word") {
          return { error: unexpected(target ?? undefined) };
        }
        redirects.push(
          token.op === "<"
            ? { kind: "in", target: target.word }
            : { kind: "out", target: target.word, append: token.op === ">>" },
        );
        position += 2;
      } else break;
    }
    if (words.length === 0 && redirects.length === 0)
      return { error: unexpected(tokens[position]) };
    return { words, redirects };
  };

  const parsePipeline = (): Pipeline | { error: ReturnType<typeof fail> } => {
    const commands: SimpleCommand[] = [];
    for (;;) {
      const command = parseSimple();
      if ("error" in command) return command;
      commands.push(command);
      const token = tokens[position];
      if (token?.type === "op" && token.op === "|") position++;
      else break;
    }
    return { commands };
  };

  const first = parsePipeline();
  if ("error" in first) return first.error;
  const rest: { connector: Connector; pipeline: Pipeline }[] = [];
  while (position < tokens.length) {
    const token = tokens[position] as Token;
    if (token.type !== "op" || (token.op !== ";" && token.op !== "&&" && token.op !== "||")) {
      return unexpected(token);
    }
    position++;
    // A trailing `;` is fine; a trailing `&&` or `||` is not.
    if (position >= tokens.length) {
      if (token.op === ";") break;
      return unexpected(undefined);
    }
    const pipeline = parsePipeline();
    if ("error" in pipeline) return pipeline.error;
    rest.push({ connector: token.op, pipeline });
  }
  return { ok: true, list: { first, rest } };
}
