import { SOURCE_LOCALE, type Locale } from "@tutor-nvim/exercise-schema";
import { en } from "./en";
import type { Messages } from "./messages";

/** Fetches one language's interface text. */
export type PackLoader = () => Promise<Messages>;

/**
 * One pack per language, not two (T-902, AGENTS 2.10).
 *
 * English is imported statically: it is the source language and the fallback, so no screen ever
 * shows a raw key while another pack is on its way, and the app still reads if that pack cannot be
 * fetched. Every other language is reached through a dynamic import, so the bundler emits it as its
 * own asset and a learner downloads only the language they read. The chunk is named `catalog-es` in
 * `vite.config.ts`; `tests/perf` watches for that request.
 */
const packs: Readonly<Partial<Record<Locale, PackLoader>>> = {
  es: () => import("./es").then((module) => module.es),
};

/** Catalogs in memory: the source language is always here, others once their pack has arrived. */
const inMemory = new Map<Locale, Messages>([[SOURCE_LOCALE, en]]);

/** Packs a runtime already holds without fetching anything; only the test runner fills this. */
const registered = new Map<Locale, Messages>();

/** Makes `messages` the catalog for `locale` with no fetch. See `testPacks.ts`. */
export function registerCatalog(locale: Locale, messages: Messages): void {
  registered.set(locale, messages);
}

/** Whether `locale` can be read right now, so the screen does not have to wait for anything. */
export function catalogReady(locale: Locale): boolean {
  return inMemory.has(locale) || registered.has(locale);
}

/** The catalog to render for `locale` now: its pack if held, else the source language. */
export function catalogFor(locale: Locale): Messages {
  return inMemory.get(locale) ?? registered.get(locale) ?? en;
}

/**
 * Fetches the pack for `locale`, once. A pack that fails to load is not remembered, so the caller
 * keeps reading the source language and a later attempt can still succeed.
 */
export async function loadCatalog(locale: Locale): Promise<Messages> {
  const ready = inMemory.get(locale);
  if (ready) return ready;
  const load = packs[locale];
  if (!load) return en;
  const messages = await load();
  inMemory.set(locale, messages);
  return messages;
}
