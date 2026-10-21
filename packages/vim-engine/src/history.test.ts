import { describe, expect, it } from "vitest";
import { accepted, press, run, start } from "./helpers.test-util";

describe("undo / redo", () => {
  it("undoes one command at a time", () => {
    expect(run("abcdef", [0, 0], "xx").text).toBe("cdef");
    expect(run("abcdef", [0, 0], "xxu").text).toBe("bcdef");
    expect(run("abcdef", [0, 0], "xxuu").text).toBe("abcdef");
  });

  it("treats an insert session, with the command that opened it, as one step", () => {
    expect(run("abc", [0, 1], "iXYZ<Esc>u")).toMatchObject({ text: "abc", cursor: [0, 1] });
    expect(run('a "xyz" b', [0, 4], 'ci"Q<Esc>u')).toMatchObject({
      text: 'a "xyz" b',
      cursor: [0, 3],
    });
    expect(run("abc\ndef", [0, 1], "oX<CR>Y<Esc>u").text).toBe("abc\ndef");
  });

  it("leaves no undo step for an insert that changed nothing", () => {
    const state = press(start("abc"), "x" + "i<Esc>");
    expect(press(state, "u").buffer.lines).toEqual(["abc"]);
  });

  it("redoes what was undone, and a new change clears the redo history", () => {
    expect(run("abcdef", [0, 0], "xxuu<C-r>").text).toBe("bcdef");
    expect(run("abcdef", [0, 0], "xxuu<C-r><C-r>").text).toBe("cdef");
    expect(run("abcdef", [0, 0], "xu<C-r>").text).toBe("bcdef");
    expect(run("abcdef", [0, 0], "xuxu<C-r>").text).toBe("bcdef");
    const cleared = press(start("abcdef"), "xxuix<Esc>");
    expect(accepted(cleared, "<C-r>")).toEqual([false]);
  });

  it("restores lines removed by dd and puts the cursor on them (column capped at the first non-blank)", () => {
    expect(run("one\ntwo\nthree", [1, 2], "ddu")).toMatchObject({
      text: "one\ntwo\nthree",
      cursor: [1, 0],
    });
    expect(run("one\ntwo\nthree", [1, 2], "ddu<C-r>").text).toBe("one\nthree");
  });

  it("reports nothing to undo or redo as not accepted", () => {
    expect(accepted(start("abc"), "u<C-r>")).toEqual([false, false]);
  });

  it("does not turn put into several steps", () => {
    expect(run("a\nb", [0, 0], "yyPu").text).toBe("a\nb");
    expect(run("abc", [0, 0], "xpu").text).toBe("bc");
  });
});

describe("dot repeat", () => {
  it("repeats the last change, not motions", () => {
    expect(run("abcdef", [0, 0], "x.").text).toBe("cdef");
    expect(run("one two three four", [0, 0], "dw.").text).toBe("three four");
    // dw, w (motion, not repeated), x, then `.` repeats the x.
    expect(run("one two three four", [0, 0], "dwwx.").text).toBe("two ree four");
  });

  it("repeats an insert session with its typed text", () => {
    expect(run("ab", [0, 0], "iX<Esc>.").text).toBe("XXab");
    expect(run("ab", [0, 1], "aX<Esc>.").text).toBe("abXX");
    expect(run("a", [0, 0], "oX<Esc>.").text).toBe("a\nX\nX");
    expect(run("ab", [0, 0], "iX<CR>Y<Esc>.").text).toBe("X\nX\nYYab");
  });

  it("repeats operator + text object changes elsewhere", () => {
    expect(run('a "x" b "y"', [0, 3], 'ci"Q<Esc>f"f".').text).toBe('a "Q" b "Q"');
    expect(run("(one) (two)", [0, 1], "ci(Z<Esc>f(.").text).toBe("(Z) (Z)");
    expect(run("foo bar baz", [0, 0], "ciwX<Esc>w.").text).toBe("X X baz");
  });

  it("does not repeat yanks, undo or redo", () => {
    // `.` repeats the x, not the yank that came after it.
    expect(run("abc", [0, 0], "xyl.").text).toBe("c");
    // The last *change* is still the second `x`; undo does not replace it.
    expect(run("abcd", [0, 0], "xxu.").text).toBe("cd");
  });

  it("is one undo step per replay", () => {
    expect(run("abcdef", [0, 0], "x.u").text).toBe("bcdef");
  });

  it("is atomic: if the command fails here, nothing changes and the typed text is not executed", () => {
    const state = press(start('a "x" b\nplain text'), 'ci"production<Esc>');
    const moved = press(state, "j");
    expect(accepted(moved, ".")).toEqual([false]);
    expect(press(moved, ".").buffer.lines).toEqual(['a "production" b', "plain text"]);
  });

  it("does nothing before any change", () => {
    expect(accepted(start("abc"), ".")).toEqual([false]);
  });
});
