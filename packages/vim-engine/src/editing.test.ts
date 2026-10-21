import { describe, expect, it } from "vitest";
import { accepted, press, run, start } from "./helpers.test-util";

describe("insert transitions", () => {
  it("a appends after the cursor character, o opens a line below", () => {
    expect(run("abc", [0, 1], "aX<Esc>")).toMatchObject({ text: "abXc", cursor: [0, 2] });
    expect(run("abc", [0, 2], "aX<Esc>")).toMatchObject({ text: "abcX", cursor: [0, 3] });
    expect(run("abc\nxyz", [0, 1], "oQ<Esc>")).toMatchObject({
      text: "abc\nQ\nxyz",
      cursor: [1, 0],
    });
  });

  it("handle empty buffers and lines", () => {
    expect(run("", [0, 0], "ahi<Esc>")).toMatchObject({ text: "hi", cursor: [0, 1] });
    expect(run("", [0, 0], "ohi<Esc>")).toMatchObject({ text: "\nhi", cursor: [1, 1] });
    expect(run("", [0, 0], "i<Esc>")).toMatchObject({ text: "", cursor: [0, 0], mode: "normal" });
  });

  it("Enter splits the line and typing continues on the new one", () => {
    expect(run("abcd", [0, 2], "iX<CR>Y<Esc>")).toMatchObject({ text: "abX\nYcd", cursor: [1, 0] });
    expect(run("abc", [0, 0], "oA<CR>B<Esc>")).toMatchObject({ text: "abc\nA\nB", cursor: [2, 0] });
  });

  it("Escape moves the cursor back one column, but never past column 0", () => {
    expect(run("abc", [0, 2], "i<Esc>")).toMatchObject({ cursor: [0, 1] });
    expect(run("abc", [0, 0], "i<Esc>")).toMatchObject({ cursor: [0, 0] });
  });

  it("rejects unsupported keys in INSERT without leaving it", () => {
    const state = press(start("abc"), "i");
    expect(accepted(state, "<Left><BS>")).toEqual([false, false]);
    expect(press(state, "<Left>Q<Esc>").buffer.lines).toEqual(["Qabc"]);
  });
});

describe("operators", () => {
  it("dd, yy and cc work on whole lines and fill the register linewise", () => {
    expect(run("a\nb\nc", [1, 0], "dd")).toMatchObject({
      text: "a\nc",
      cursor: [1, 0],
      register: { text: "b", linewise: true },
    });
    expect(run("a\nb\nc", [1, 0], "yy")).toMatchObject({
      text: "a\nb\nc",
      cursor: [1, 0],
      register: { text: "b", linewise: true },
    });
    expect(run("a\n  b\nc", [1, 3], "ccX<Esc>")).toMatchObject({ text: "a\nX\nc", cursor: [1, 0] });
  });

  it("dd on the last line moves the cursor up, and on the only line leaves an empty buffer", () => {
    expect(run("a\nb", [1, 0], "dd")).toMatchObject({ text: "a", cursor: [0, 0] });
    expect(run("only", [0, 2], "dd")).toMatchObject({ text: "", cursor: [0, 0] });
  });

  it("compose with motions: d/c/y + w, $, 0, f, t", () => {
    expect(run("foo bar baz", [0, 4], "dw").text).toBe("foo baz");
    expect(run("foo bar baz", [0, 4], "d$").text).toBe("foo ");
    expect(run("foo bar baz", [0, 4], "d0").text).toBe("bar baz");
    expect(run("a,b,c", [0, 0], "df,").text).toBe("b,c");
    expect(run("a,b,c", [0, 0], "dt,").text).toBe(",b,c");
    expect(run("a,b,c", [0, 0], "f,d;").text).toBe("ac");
    expect(run("foo bar", [0, 0], "yw").register).toEqual({ text: "foo ", linewise: false });
    expect(run("foo bar", [0, 4], "yb")).toMatchObject({
      cursor: [0, 0],
      register: { text: "foo ", linewise: false },
    });
  });

  it("dw on the last word of a line stops at the end of the line", () => {
    expect(run("foo bar\nbaz", [0, 4], "dw")).toMatchObject({ text: "foo \nbaz", cursor: [0, 3] });
  });

  it("cw changes to the end of the word, not including the blanks after it", () => {
    expect(run("foo bar", [0, 0], "cwX<Esc>").text).toBe("X bar");
    expect(run("foo bar", [0, 2], "cwX<Esc>").text).toBe("foX bar");
    expect(run("foo   bar", [0, 3], "cwX<Esc>").text).toBe("fooXbar");
  });

  it("dj/dk are linewise and fail at the buffer edges", () => {
    expect(run("a\nb\nc", [0, 0], "dj")).toMatchObject({
      text: "c",
      register: { text: "a\nb", linewise: true },
    });
    expect(run("a\nb\nc", [2, 0], "dk").text).toBe("a");
    expect(run("a\nb", [1, 0], "dj").text).toBe("a\nb");
  });

  it("an unsupported key after an operator cancels it", () => {
    expect(run("abc", [0, 0], "dzx").text).toBe("bc");
  });

  it("x deletes the character under the cursor into the register", () => {
    expect(run("abc", [0, 1], "x")).toMatchObject({
      text: "ac",
      cursor: [0, 1],
      register: { text: "b", linewise: false },
    });
    expect(run("abc", [0, 2], "x")).toMatchObject({ text: "ab", cursor: [0, 1] });
    expect(run("", [0, 0], "x")).toMatchObject({ text: "", register: null });
  });
});

describe("put", () => {
  it("p and P with charwise text", () => {
    expect(run("abc", [0, 0], "xp")).toMatchObject({ text: "bac", cursor: [0, 1] });
    expect(run("abc", [0, 1], "xP")).toMatchObject({ text: "abc", cursor: [0, 1] });
    expect(run("one two", [0, 0], "dwP")).toMatchObject({ text: "one two", cursor: [0, 3] });
  });

  it("p and P with linewise text put lines below/above and land on the first non-blank", () => {
    expect(run("a\n  b", [1, 2], "yyp")).toMatchObject({ text: "a\n  b\n  b", cursor: [2, 2] });
    expect(run("a\nb", [1, 0], "yyP")).toMatchObject({ text: "a\nb\nb", cursor: [1, 0] });
    expect(run("a\nb", [0, 0], "ddp")).toMatchObject({ text: "b\na", cursor: [1, 0] });
  });

  it("fail when the register is empty", () => {
    expect(accepted(start("abc"), "p")).toEqual([false]);
  });
});

describe("text objects", () => {
  it("iw selects the word or the blanks under the cursor", () => {
    expect(run("foo bar_baz  qux", [0, 6], "diw").text).toBe("foo   qux");
    expect(run("foo bar", [0, 3], "diw").text).toBe("foobar");
    expect(run("foo.bar", [0, 3], "diw").text).toBe("foobar");
    expect(run("foo bar", [0, 0], "ciwX<Esc>").text).toBe("X bar");
  });

  it('i" / a"', () => {
    expect(run('x = "abc" + 1', [0, 6], 'di"').text).toBe('x = "" + 1');
    expect(run('x = "abc" + 1', [0, 6], 'da"').text).toBe("x = + 1");
    expect(run('x = "abc"', [0, 6], 'da"').text).toBe("x =");
    expect(run('x = "abc" + 1', [0, 6], 'yi"').register).toEqual({ text: "abc", linewise: false });
  });

  it("i( / a( handle nesting, the cursor on a bracket, and multiple lines", () => {
    expect(run("f(a, (b), c)", [0, 6], "di(").text).toBe("f(a, (), c)");
    expect(run("f(a, (b), c)", [0, 8], "di(").text).toBe("f()");
    expect(run("f(a, (b), c)", [0, 2], "di(").text).toBe("f()");
    expect(run("f(a, (b), c)", [0, 1], "di(").text).toBe("f()");
    expect(run("f(a, (b), c)", [0, 11], "di(").text).toBe("f()");
    expect(run("f(a, (b), c)", [0, 6], "da(").text).toBe("f(a, , c)");
    expect(run("fn(\n  a,\n  b\n)", [1, 2], "di(")).toMatchObject({
      text: "fn(\n)",
      cursor: [1, 0],
    });
    expect(run("fn(\n  a,\n  b\n)", [1, 2], "ci(X<Esc>").text).toBe("fn(\nX\n)");
  });

  it("i{ / a{ and failures", () => {
    expect(run("{ x: { y }, z }", [0, 7], "di{").text).toBe("{ x: {}, z }");
    expect(run("{ x: { y }, z }", [0, 1], "da{").text).toBe("");
    expect(accepted(start("no brackets"), "di(")).toEqual([true, true, false]);
  });

  it("unsupported objects are rejected", () => {
    expect(accepted(start("foo bar"), "daw")).toEqual([true, true, false]);
    expect(accepted(start("foo(bar)"), "di[")).toEqual([true, true, false]);
  });
});
