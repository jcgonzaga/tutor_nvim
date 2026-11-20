import { type Locale } from "@tutor-nvim/exercise-schema";
import {
  contentFor,
  contentReady,
  localizedContent,
  type Content,
  type LocaleOverlay,
} from "../exercises";

/** Fetches one language's content overlay. */
type OverlayLoader = () => Promise<LocaleOverlay>;

/**
 * The content half of a language pack (T-902, ADR-0005), beside the interface catalog in
 * `catalogs.ts`.
 *
 * English is the source content and is always in the entry: it is the base every translation is
 * checked against, and the fallback while another language's overlay is on its way. Every other
 * language is reached through a dynamic import, so only a learner who reads it downloads it; the
 * bundler names that chunk after its module (`esContent-<hash>.js`). `tests/perf` asserts it is not
 * in the first load and that it really carries the overlay.
 */
const packs: Readonly<Partial<Record<Locale, OverlayLoader>>> = {
  es: () => import("./esContent").then((module) => module.esOverlay),
};

/**
 * Builds the content for `locale`, once. A pack that fails to load is not remembered, so the caller
 * keeps reading the source language and a later attempt can still succeed.
 */
export async function loadContentFor(locale: Locale): Promise<Content> {
  if (contentReady(locale)) return contentFor(locale);
  const load = packs[locale];
  if (!load) return contentFor(locale);
  return localizedContent(locale, await load());
}
