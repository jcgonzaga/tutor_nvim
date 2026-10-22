import type { en } from "./en";

/**
 * The shape of every language's interface text. It is derived from the English catalog, so a
 * translation that misses a key, or gives it another type, does not compile. Plain strings are
 * widened; entries that take values (counts, names) are functions, which also carry the plural rules.
 */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : { readonly [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof en>;
