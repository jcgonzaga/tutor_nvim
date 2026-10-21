/**
 * Inputs for the Vim oracle: each case is run through real Vim (see
 * `tools/vim-oracle`) and through this engine, and the results must agree.
 * Every case must end in NORMAL mode. Cursors are zero-based `[line, column]`.
 *
 * Regenerate expectations with `pnpm vim:oracle` after changing this file.
 */
export interface OracleCase {
  readonly name: string;
  readonly lines: readonly string[];
  readonly cursor: readonly [line: number, column: number];
  readonly keys: string;
}

const cases: OracleCase[] = [];

function add(group: string, lines: readonly string[], cursor: [number, number], keys: string): void {
  cases.push({ name: `${group} | ${JSON.stringify(lines)} @${cursor[0]},${cursor[1]} | ${keys}`, lines, cursor, keys });
}

/** Every position of the buffer, optionally thinned out on long lines. */
function positions(lines: readonly string[], every = 1): [number, number][] {
  const result: [number, number][] = [];
  lines.forEach((line, l) => {
    for (let c = 0; c < Math.max(line.length, 1); c += every) result.push([l, c]);
  });
  return result;
}

const BUFFER_A = ["foo bar  baz", "  indented, text(here) ok", "", "last-line_with.punct!"];
const BUFFER_B = ["alpha", "", "beta gamma", "   ", "delta"];
const BUFFER_C = ["x"];

// --- motions ---------------------------------------------------------------------------------------

const MOTIONS = ["h", "l", "j", "k", "w", "W", "b", "B", "e", "E", "0", "^", "$"];

for (const buffer of [BUFFER_A, BUFFER_B, BUFFER_C]) {
  for (const at of positions(buffer)) for (const motion of MOTIONS) add("motion", buffer, at, motion);
}

// j/k keep the desired column across short lines; $ sticks to the end of line.
const COLUMN_BUFFER = ["abcdefghij", "ab", "", "abcdefghijklm", "xyz"];
for (const keys of ["jj", "jjj", "jjjj", "jjk", "jjkk", "$j", "$jj", "$jjj", "$jk", "0jj", "kk", "jjjjkkkk", "$jjjjkkkk"]) {
  for (const col of [0, 3, 7, 9]) add("column", COLUMN_BUFFER, [0, col], keys);
}
for (const col of [0, 5, 12]) add("column", COLUMN_BUFFER, [3, col], "kkk");

// --- f t ; , ---------------------------------------------------------------------------------------

const SEARCH_BUFFER = ["a,b,c,d,e", "x = foo(a, b); y", "aaaa", "no commas here"];
for (const at of positions(SEARCH_BUFFER, 2)) {
  for (const keys of [
    "f,", "t,", "fa", "ta", "fz", "tz", "f,;", "f,;;", "f,,", "t,;", "t,;;", "t,,", "t,;,", "f,;,", ";", ",", "fa;,", "ta,;", "f(;", "t);",
  ]) {
    add("search", SEARCH_BUFFER, at, keys);
  }
}

// --- insert transitions ----------------------------------------------------------------------------

const INSERT_BUFFER = ["abc", "", "xyz"];
for (const at of positions(INSERT_BUFFER)) {
  for (const keys of ["i<Esc>", "iQ<Esc>", "iQR<Esc>", "a<Esc>", "aQ<Esc>", "aQR<Esc>", "o<Esc>", "oQ<Esc>", "oQR<Esc>", "iA<CR>B<Esc>", "aA<CR>B<Esc>", "oA<CR>B<CR>C<Esc>", "i<CR><Esc>", "iA<Esc>iB<Esc>"]) {
    add("insert", INSERT_BUFFER, at, keys);
  }
}
add("insert", [""], [0, 0], "ihello world<Esc>");
add("insert", [""], [0, 0], "ahello<Esc>");
add("insert", [""], [0, 0], "ohello<Esc>");
add("insert", [""], [0, 0], "i<Esc><Esc>");
add("insert", ["ab"], [0, 1], "a<CR>c<Esc>");

// --- operators with motions ------------------------------------------------------------------------

const OPERATOR_KEYS: Record<string, string> = { d: "", y: "", c: "Z<Esc>" };
for (const [buffer, every] of [[BUFFER_A, 5], [BUFFER_B, 1], [BUFFER_C, 1]] as const) {
  for (const at of positions(buffer, every)) {
    for (const op of ["d", "y", "c"]) {
      for (const motion of MOTIONS) add("operator", buffer, at, `${op}${motion}${OPERATOR_KEYS[op]}`);
    }
  }
}
for (const at of positions(SEARCH_BUFFER, 4)) {
  for (const motion of ["f,", "t,", "fa", "ta", "f,;", "t,;", "f,,", "fz"]) {
    for (const op of ["d", "y", "c"]) add("operator-search", SEARCH_BUFFER, at, `${op}${motion}${OPERATOR_KEYS[op]}`);
  }
}

// Doubled operators, linewise motions and the x command.
const LINE_BUFFER = ["one", "  two", "", "three four", "five"];
for (const at of positions(LINE_BUFFER, 2)) {
  for (const keys of ["dd", "yy", "ccZ<Esc>", "dj", "dk", "yj", "yk", "cjZ<Esc>", "ckZ<Esc>", "x", "xx", "xxx", "ddp", "ddP", "yyp", "yyP", "yyjp", "yykP", "dwP", "xp", "xP", "dd.", "x.", "ddu", "xu"]) {
    add("lines", LINE_BUFFER, at, keys);
  }
}
for (const lines of [[""], ["only"], ["a", "b"]]) {
  for (const at of positions(lines)) {
    for (const keys of ["dd", "ddp", "ddP", "yyp", "yyP", "ccZ<Esc>", "x", "dj", "dk", "ddu", "dddd", "dddd" + "u", "yyjp"]) add("lines-edge", lines, at, keys);
  }
}

// cw / dw special cases.
const WORD_EDGE = ["foo bar", "foo  bar   ", "a", "foo", "  x  y", "", "end"];
for (const at of positions(WORD_EDGE)) {
  for (const keys of ["cwX<Esc>", "cWX<Esc>", "dw", "dW", "yw", "ce" + "X<Esc>", "db", "dB", "yb", "de", "dE"]) add("cw-dw", WORD_EDGE, at, keys);
}

// --- text objects ----------------------------------------------------------------------------------

const TEXT_OBJECT_OPERATORS: [string, string][] = [["d", ""], ["y", ""], ["c", "Z<Esc>"]];

function textObjects(group: string, lines: readonly string[], objects: readonly string[], every = 1): void {
  for (const at of positions(lines, every)) {
    for (const [op, tail] of TEXT_OBJECT_OPERATORS) {
      for (const object of objects) add(group, lines, at, `${op}${object}${tail}`);
    }
  }
}

textObjects("iw", ["foo bar_baz  qux.quux", "   lead", "x", "", "a  b"], ["iw"]);
textObjects("quotes", ['say "hello world" and "bye" now', 'a "b" c "d" e', '"x"', 'q = "";', 'esc \\"not\\" "yes"', 'one " two', '"a" x "b"', '  "  pad  "  tail'], ['i"', 'a"'], 2);
textObjects("blocks", ["f(a, (b), c) + g(d)", "{ x: { y: 1 }, z }", "()", "{}", "f( a )", "no brackets"], ["i(", "a(", "i{", "a{"], 2);
textObjects("blocks-multiline", ["fn(", "  a,", "  b", ")"], ["i(", "a("]);
textObjects("blocks-multiline", ["if (x) {", "  foo();", "  bar();", "}"], ["i{", "a{", "i("]);
textObjects("blocks-multiline", ["call(a,", "     b)", "x"], ["i(", "a("]);
textObjects("blocks-multiline", ["{", "}"], ["i{", "a{"]);
textObjects("blocks-multiline", ["  {", "    x", "  }"], ["i{", "a{"]);

// --- put -------------------------------------------------------------------------------------------

const PUT_BUFFER = ["alpha beta", "gamma", ""];
for (const at of positions(PUT_BUFFER, 3)) {
  for (const keys of ["yiwp", "yiwP", "yiwjp", "yiwjP", "yyp", "yyP", "yyjp", "yykP", "dwp", "dwP", "ywwP", "ywwp", "d$p", "d$P", "y$p", "xp", "xP", "xxP", "ddp", "ddjP", "p", "P", "yjP", "yjp", "dbP", "dbp", "ybP", "ybp", "yjjp", "djp", "djP"]) {
    add("put", PUT_BUFFER, at, keys);
  }
}
add("put", ["a b", "c d"], [0, 2], "dbjp");
add("put", ["one two", "three four"], [0, 4], "dbjp");
add("put", ["one two", "three four"], [0, 4], "dwP");
add("put", ["one two", "three"], [1, 0], "dbP");
add("put", ["one two", "three"], [1, 0], "dbp");
add("put", ["one two", "three"], [1, 2], "dbp");

// --- undo / redo -----------------------------------------------------------------------------------

const UNDO_BUFFER = ["foo bar baz", "  second line", "third"];
const UNDO_SEQUENCES = [
  "xu", "xxu", "xxuu", "xxuuu", "xu<C-r>", "xxuu<C-r>", "xxuu<C-r><C-r>", "<C-r>", "u", "uu",
  "ixy<Esc>u", "ixy<Esc>u<C-r>", "axy<Esc>u", "axy<Esc>u<C-r>", "oxy<Esc>u", "oxy<Esc>u<C-r>", "ixy<Esc>ixy<Esc>u", "ixy<Esc>ixy<Esc>uu",
  "dwu", "dwu<C-r>", "ddu", "ddu<C-r>", "dduu", "yyPu", "yyPu<C-r>", "ddpu", "ddpu<C-r>", "xpu", "xpu<C-r>", "xpuu",
  "cwQ<Esc>u", "cwQ<Esc>u<C-r>", "ciwQ<Esc>u", "ciwQ<Esc>u<C-r>", "ccQ<Esc>u", "ccQ<Esc>u<C-r>", "dw.u", "dw..u", "dw..uu", "dw..uuu<C-r>",
  "wxu", "wxu<C-r>", "wxxuu<C-r>", "yypu", "yyPuu", "xuxu", "xxxuuu<C-r><C-r><C-r>", "xux", "xuxu<C-r>",
  "iQ<Esc>xu", "dwiQ<Esc>uu", "dwiQ<Esc>uu<C-r>", "dwiQ<Esc>uu<C-r><C-r>",
];
for (const at of positions(UNDO_BUFFER, 5)) for (const keys of UNDO_SEQUENCES) add("undo", UNDO_BUFFER, at, keys);

// --- dot repeat ------------------------------------------------------------------------------------

const DOT_BUFFER = ['a "x" b "y" c', "foo bar baz qux", "(one) (two) (three)"];
const DOT_SEQUENCES = [
  ".", "x.", "xx.", "x..", "dw.", "dw..", "dd.", "dd..", "cwQ<Esc>w.", "cwQ<Esc>ww.", "ciwQ<Esc>w.", "ciwQ<Esc>ww.", 'ci"Q<Esc>f"f".', 'ci"Q<Esc>f".', "ci(Q<Esc>f(.", "ci(Q<Esc>.", "da(.", "da(f(.", "iQ<Esc>.", "iQ<Esc>l.", "aQ<Esc>.", "oQ<Esc>.", "oQ<Esc>..", "yy.", "yyp.", "x.u", "x.uu", "dw.u", "dwu.", "xjx.", "xj.", "pu.", "ddp.", "ddP.", "dwP.", "x.p", "cwQ<Esc>j0.", "cwQ<Esc>u.", "iA<CR>B<Esc>.", "ih<Esc>j.", "dfa.", "dta.", "dfa;.", "dt,.", "dt,;.", "cfaZ<Esc>.", "x,.", "xf,.", "xf,x.", "ylp.", "diw.", "diwj.", "d$.", "d$j.",
];
for (const at of positions(DOT_BUFFER, 7)) for (const keys of DOT_SEQUENCES) add("dot", DOT_BUFFER, at, keys);

export const ORACLE_CASES: readonly OracleCase[] = cases;
