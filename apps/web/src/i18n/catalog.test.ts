import { describe, expect, it } from "vitest";
import { en } from "./en";
import { es } from "./es";

type Tree = { readonly [key: string]: string | ((...args: never[]) => string) | Tree };

/** Every leaf of a catalog with its dotted path. Functions are called with sample values. */
function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]): [string, string][] => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") return [[path, value]];
    if (typeof value === "function") {
      const call = value as (...args: unknown[]) => string;
      // A count in every position: enough to exercise every plural branch of both languages.
      return [1, 2, 5].map((n): [string, string] => [`${path}(${n})`, call(n, n, n, n, n)]);
    }
    return leaves(value, path);
  });
}

describe("interface catalog", () => {
  const english = leaves(en as unknown as Tree);
  const spanish = leaves(es as unknown as Tree);

  it("has the same entries in every language", () => {
    expect(spanish.map(([path]) => path)).toEqual(english.map(([path]) => path));
  });

  it.each([
    ["English", english],
    ["Spanish", spanish],
  ] as const)("%s has no empty or placeholder text", (_language, entries) => {
    for (const [path, text] of entries) {
      expect(text.trim(), path).not.toBe("");
      expect(text, path).not.toMatch(/\b(undefined|NaN|TODO|\[object)\b/);
    }
  });

  it("translates the text: Spanish differs from English for most entries", () => {
    const same = spanish.filter(([path, text], index) => text === english[index]![1] && path);
    // Brand names, units and key names are legitimately identical (XP, Combo, Tutor NeoVim, ...).
    expect(same.length / spanish.length).toBeLessThan(0.15);
  });

  it("uses the agreed vocabulary", () => {
    const all = spanish.map(([, text]) => text).join("\n");
    expect(all).toMatch(/habilidad/i);
    expect(all).not.toMatch(/\bskills?\b/i);
  });
});
