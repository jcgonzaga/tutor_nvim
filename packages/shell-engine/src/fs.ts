/**
 * The virtual file system: an immutable tree of files and directories addressed by absolute paths
 * split into parts (`/home/user/a.txt` is `["home", "user", "a.txt"]`). Every operation returns a
 * new tree, so shell states can be kept, compared and replayed like the Vim engine's.
 *
 * Deliberately small: no symlinks, owners other than the single learner, or timestamps. Anything
 * the simulator does not model is absent rather than faked.
 */
export type FsNode = FileNode | DirNode;

export interface FileNode {
  readonly kind: "file";
  readonly content: string;
  /** Permission bits, e.g. `0o644`. */
  readonly mode: number;
}

export interface DirNode {
  readonly kind: "dir";
  readonly mode: number;
  readonly children: Readonly<Record<string, FsNode>>;
}

export const DEFAULT_FILE_MODE = 0o644;
export const DEFAULT_DIR_MODE = 0o755;

export const emptyDir = (mode = DEFAULT_DIR_MODE): DirNode => ({ kind: "dir", mode, children: {} });
export const file = (content = "", mode = DEFAULT_FILE_MODE): FileNode => ({
  kind: "file",
  content,
  mode,
});

/** Builds a tree from `{ "path/to/file": "content" }`; a trailing `/` makes an empty directory. */
export function fsFromFiles(entries: Readonly<Record<string, string | FileNode>>): DirNode {
  let root = emptyDir();
  for (const [path, value] of Object.entries(entries)) {
    const parts = splitPath(path);
    if (path.endsWith("/")) {
      root = ensureDir(root, parts);
    } else {
      root = ensureDir(root, parts.slice(0, -1));
      root = setNode(root, parts, typeof value === "string" ? file(value) : value) ?? root;
    }
  }
  return root;
}

function ensureDir(root: DirNode, parts: readonly string[]): DirNode {
  let current = root;
  for (let depth = 1; depth <= parts.length; depth++) {
    const prefix = parts.slice(0, depth);
    if (getNode(current, prefix) === undefined) {
      current = setNode(current, prefix, emptyDir()) ?? current;
    }
  }
  return current;
}

export const splitPath = (path: string): string[] => path.split("/").filter((part) => part !== "");

/** `/a/b` for `["a", "b"]`, `/` for the root. */
export const joinPath = (parts: readonly string[]): string => `/${parts.join("/")}`;

/**
 * Resolves `path` against `cwd` into absolute parts, folding `.` and `..` lexically (there are no
 * symlinks, so this equals what the kernel does). `..` at the root stays at the root.
 */
export function resolveParts(cwd: readonly string[], path: string): string[] {
  const out: string[] = path.startsWith("/") ? [] : [...cwd];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out;
}

export function getNode(root: DirNode, parts: readonly string[]): FsNode | undefined {
  let node: FsNode = root;
  for (const part of parts) {
    if (node.kind !== "dir") return undefined;
    const next: FsNode | undefined = node.children[part];
    if (next === undefined) return undefined;
    node = next;
  }
  return node;
}

/**
 * Puts `node` at `parts`. Returns `undefined` when the parent is missing or is not a directory;
 * the caller decides which error to report.
 */
export function setNode(
  root: DirNode,
  parts: readonly string[],
  node: FsNode,
): DirNode | undefined {
  if (parts.length === 0) return node.kind === "dir" ? node : undefined;
  const [head, ...rest] = parts as [string, ...string[]];
  const child = root.children[head];
  if (rest.length === 0) return { ...root, children: { ...root.children, [head]: node } };
  if (child === undefined || child.kind !== "dir") return undefined;
  const updated = setNode(child, rest, node);
  return updated === undefined
    ? undefined
    : { ...root, children: { ...root.children, [head]: updated } };
}

/** Removes the node at `parts` (not the root). Returns the tree unchanged if it is not there. */
export function removeNode(root: DirNode, parts: readonly string[]): DirNode {
  if (parts.length === 0) return root;
  const [head, ...rest] = parts as [string, ...string[]];
  const child = root.children[head];
  if (child === undefined) return root;
  if (rest.length === 0) {
    const others = { ...root.children };
    delete others[head];
    return { ...root, children: others };
  }
  if (child.kind !== "dir") return root;
  return { ...root, children: { ...root.children, [head]: removeNode(child, rest) } };
}

/** Child names in the order a listing shows them: plain byte order, like `LC_ALL=C`. */
export const sortedNames = (dir: DirNode): string[] =>
  Object.keys(dir.children).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** Size in bytes as `ls -l` reports it: content length for files, one block for directories. */
export const sizeOf = (node: FsNode): number =>
  node.kind === "file" ? new TextEncoder().encode(node.content).length : 4096;

export function modeString(node: FsNode): string {
  const bits = "rwxrwxrwx";
  let out = node.kind === "dir" ? "d" : "-";
  for (let i = 0; i < 9; i++) out += node.mode & (1 << (8 - i)) ? bits[i] : "-";
  return out;
}
