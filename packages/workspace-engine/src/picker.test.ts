import { describe, expect, it } from "vitest";

import {
  activeTab,
  applyWorkspaceAction,
  bufferId,
  createWorkspace,
  leafBufferIds,
  type WorkspaceActionOptions,
  type WorkspaceGrepMatch,
  type WorkspaceState,
} from "./index";

/*
 * The picker as a deterministic query (T5c, S6).
 *
 * `file.find` opens the first file in sorted order whose path holds the query, `grep.project`
 * records the matching (path, line, text) rows in the state, and `buffer.list` focuses the open
 * buffer a path names. No scoring, no ranking, no "best match" and no timer, so the same query
 * against the same project always gives the same state and a replay is the state it recorded.
 *
 * The rows and the file are asserted exactly: the point of the model is that the answer is a fact
 * about the project, not a heuristic a learner has to second-guess.
 */

const SERVER_TEXT = [
  'import { config } from "./config";',
  "",
  "export const server = { port: config.port };",
].join("\n");
const CONFIG_TEXT = "export const config = { port: 3000 };";
const README_TEXT = "# Shop API\n\nRun pnpm dev to start the server.";
const TEST_TEXT = 'import { server } from "../src/server";\n\nserver.port;';
const ROUTER_TEXT = "export const router = { get: () => null };";
const APP_TEXT = 'import { router } from "./router";';

/**
 * The simulated project, deliberately *not* in path order: a picker that read the disk's own order
 * would answer differently from a picker that sorts, and the tests below tell the two apart.
 */
const FILES: Readonly<Record<string, string>> = {
  "src/server.ts": SERVER_TEXT,
  "README.md": README_TEXT,
  "tests/server.test.ts": TEST_TEXT,
  "src/config.ts": CONFIG_TEXT,
  "src/router.ts": ROUTER_TEXT,
  "src/app.ts": APP_TEXT,
};

const CWD = "/project";
const SERVER = "src/server.ts";
const CONFIG = "src/config.ts";
const ROUTER = "src/router.ts";
const README = "README.md";
const INIT = { files: FILES, path: SERVER, cwd: CWD };

const initial = (): WorkspaceState => createWorkspace(INIT);
const act = (state: WorkspaceState, action: string, options?: WorkspaceActionOptions) =>
  applyWorkspaceAction(state, action, options);
const apply = (
  state: WorkspaceState,
  action: string,
  options?: WorkspaceActionOptions,
): WorkspaceState => act(state, action, options).state;

const pathsOf = (state: WorkspaceState): readonly string[] =>
  state.buffers.map((buffer) => buffer.path);

const row = (path: string, line: number, text: string): WorkspaceGrepMatch => ({
  path,
  line,
  text,
});

describe("file.find — the first file in sorted order whose path holds the query", () => {
  it("opens the first match in path order, not the order the simulated disk lists", () => {
    // `er` is in src/router.ts, src/server.ts and tests/server.test.ts; the disk lists the server
    // first, and the answer is still the router because `r` comes before `s`.
    const { state, applied } = act(initial(), "file.find", { query: "er" });
    expect(applied).toBe(true);
    expect(pathsOf(state)).toEqual([SERVER, ROUTER]);
    expect(state.activeBufferId).toBe(bufferId(ROUTER));
    // A find opens a buffer: it neither changes the disk nor records rows nor types a command.
    expect(state.files).toEqual(FILES);
    expect(state.matches).toEqual([]);
    expect(state.lastCommand).toBeNull();
  });

  it("matches the fragment without regard to case", () => {
    const { state, applied } = act(initial(), "file.find", { query: "ROUTER" });
    expect(applied).toBe(true);
    expect(pathsOf(state)).toEqual([SERVER, ROUTER]);
    expect(state.activeBufferId).toBe(bufferId(ROUTER));
  });

  it("focuses a buffer that is already open instead of registering it twice", () => {
    const opened = apply(initial(), "file.open", { path: ROUTER });
    const { state, applied } = act(opened, "file.find", { query: "router" });
    expect(applied).toBe(true);
    expect(pathsOf(state)).toEqual([SERVER, ROUTER]);
    expect(state.activeBufferId).toBe(bufferId(ROUTER));
  });

  it("refuses a query that matches no file, naming the query, and changes nothing", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "file.find", { query: "zzz" });
    expect(applied).toBe(false);
    expect(reason).toBe('file.find: no file matches "zzz"');
    expect(state).toBe(before);
  });

  it("refuses without a query and with an empty one, naming the query it wanted", () => {
    const before = initial();
    const missing = act(before, "file.find");
    expect(missing.applied).toBe(false);
    expect(missing.reason).toBe("file.find: no query given");
    expect(missing.state).toBe(before);

    const empty = act(before, "file.find", { query: "" });
    expect(empty.applied).toBe(false);
    expect(empty.reason).toBe("file.find: the query is empty");
    expect(empty.state).toBe(before);
  });

  it("gives the same state for the same query twice", () => {
    const first = apply(initial(), "file.find", { query: "er" });
    const second = apply(initial(), "file.find", { query: "er" });
    expect(first).toEqual(second);
  });
});

describe("grep.project — the matching rows, in project order", () => {
  it("records (path, line, text) in path order and then in line order", () => {
    const before = initial();
    const { state, applied } = act(before, "grep.project", { query: "config" });
    expect(applied).toBe(true);
    // Sorted paths are README.md, src/app.ts, src/config.ts, src/router.ts, src/server.ts,
    // tests/server.test.ts: the config row comes first even though the disk lists the server first,
    // and the server's two matching lines follow in line order.
    expect(state.matches).toEqual([
      row(CONFIG, 1, CONFIG_TEXT),
      row(SERVER, 1, 'import { config } from "./config";'),
      row(SERVER, 3, "export const server = { port: config.port };"),
    ]);
    // Searching is not opening: the buffers, the active one, the disk and the editor are untouched.
    expect(state.files).toEqual(FILES);
    expect(pathsOf(state)).toEqual([SERVER]);
    expect(state.activeBufferId).toBe(before.activeBufferId);
    expect(state.lastCommand).toBeNull();
  });

  it("replaces the rows of the previous search instead of appending to them", () => {
    const first = apply(initial(), "grep.project", { query: "config" });
    const { state, applied } = act(first, "grep.project", { query: "3000" });
    expect(applied).toBe(true);
    expect(state.matches).toEqual([row(CONFIG, 1, CONFIG_TEXT)]);
  });

  it("matches a line without regard to case", () => {
    const lower = apply(initial(), "grep.project", { query: "port" });
    const upper = apply(initial(), "grep.project", { query: "PORT" });
    expect(upper.matches).toEqual(lower.matches);
  });

  it("refuses a query that matches no line, naming it and keeping the rows it had", () => {
    const before = apply(initial(), "grep.project", { query: "port" });
    const { state, applied, reason } = act(before, "grep.project", { query: "sql" });
    expect(applied).toBe(false);
    expect(reason).toBe('grep.project: no line matches "sql"');
    expect(state).toBe(before);
  });

  it("refuses without a query and with an empty one", () => {
    const before = initial();
    const missing = act(before, "grep.project");
    expect(missing.applied).toBe(false);
    expect(missing.reason).toBe("grep.project: no query given");
    expect(missing.state).toBe(before);

    const empty = act(before, "grep.project", { query: "" });
    expect(empty.applied).toBe(false);
    expect(empty.reason).toBe("grep.project: the query is empty");
    expect(empty.state).toBe(before);
  });

  it("gives the same rows for the same query twice", () => {
    const first = apply(initial(), "grep.project", { query: "port" });
    const second = apply(initial(), "grep.project", { query: "port" });
    expect(first).toEqual(second);
  });
});

describe("buffer.list — the open buffer a path names", () => {
  const twoOpened = (): WorkspaceState =>
    apply(apply(initial(), "file.open", { path: CONFIG }), "file.open", { path: README });

  it("focuses the named open buffer without opening or closing anything", () => {
    const before = twoOpened();
    expect(before.activeBufferId).toBe(bufferId(README));
    const { state, applied } = act(before, "buffer.list", { path: CONFIG });
    expect(applied).toBe(true);
    expect(pathsOf(state)).toEqual([SERVER, CONFIG, README]);
    expect(state.activeBufferId).toBe(bufferId(CONFIG));
    const tab = activeTab(state);
    expect(tab === undefined ? [] : leafBufferIds(tab.root)).toEqual([bufferId(CONFIG)]);
    expect(state.files).toEqual(FILES);
    expect(state.lastCommand).toBeNull();
  });

  it("refuses a path that is not open even though the file is on disk, naming the path", () => {
    const before = initial();
    const { state, applied, reason } = act(before, "buffer.list", { path: ROUTER });
    expect(applied).toBe(false);
    expect(reason).toBe('buffer.list: no buffer is open for "src/router.ts"');
    expect(state).toBe(before);
    expect(pathsOf(state)).toEqual([SERVER]);
  });

  it("refuses without a path and with an empty one", () => {
    const before = initial();
    const missing = act(before, "buffer.list");
    expect(missing.applied).toBe(false);
    expect(missing.reason).toBe("buffer.list: no path given");
    expect(missing.state).toBe(before);

    const empty = act(before, "buffer.list", { path: "" });
    expect(empty.applied).toBe(false);
    expect(empty.reason).toBe("buffer.list: no path given");
    expect(empty.state).toBe(before);
  });
});
