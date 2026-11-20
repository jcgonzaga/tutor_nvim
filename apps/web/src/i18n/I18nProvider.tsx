import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { SOURCE_LOCALE, type Locale } from "@tutor-nvim/exercise-schema";
import { contentFor, contentReady, type Content } from "../exercises";
import { usePrefs } from "../prefs/PrefsProvider";
import { catalogFor, catalogReady, loadCatalog } from "./catalogs";
import { loadContentFor } from "./contentPacks";
import type { Messages } from "./messages";
// The test runner's packs, registered synchronously there; empty in the app, where the whole file
// is behind a build-time constant and is removed with its imports (see testPacks.ts).
import "./testPacks";

interface I18nValue {
  readonly locale: Locale;
  /** Interface text in the chosen language. */
  readonly t: Messages;
  /** Skills and exercises with their text in the chosen language. */
  readonly content: Content;
}

// Without a provider (unit tests, isolated components) the app speaks its source language.
const I18nContext = createContext<I18nValue>({
  locale: SOURCE_LOCALE,
  t: catalogFor(SOURCE_LOCALE),
  content: contentFor(SOURCE_LOCALE),
});

/**
 * Gives the whole app the language from the device preferences (ADR-0005).
 *
 * A language is two packs: the interface catalog and the exercise content. The source language is
 * bundled, every other one is fetched once as its own chunk (T-902). Until one arrives — or if it
 * cannot be fetched — the screen reads the source language, so a learner never sees a raw key and
 * never waits on a chunk to paint.
 */
export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const { prefs } = usePrefs();
  const locale = prefs.language;
  // A pack arriving is not a render input, it is a reason to render again.
  const [, packArrived] = useReducer((count: number) => count + 1, 0);

  const t = catalogFor(locale);
  const content = contentFor(locale);

  useEffect(() => {
    if (catalogReady(locale)) return undefined;
    let live = true;
    void loadCatalog(locale).then(
      () => {
        if (live) packArrived();
      },
      (error: unknown) => {
        // The source language is on screen already; saying so is better than a raw key or a blank.
        console.warn(`no "${locale}" interface pack; reading in "${SOURCE_LOCALE}"`, error);
      },
    );
    return () => {
      live = false;
    };
  }, [locale]);

  useEffect(() => {
    if (contentReady(locale)) return undefined;
    let live = true;
    void loadContentFor(locale).then(
      () => {
        if (live) packArrived();
      },
      (error: unknown) => {
        console.warn(`no "${locale}" content pack; reading in "${SOURCE_LOCALE}"`, error);
      },
    );
    return () => {
      live = false;
    };
  }, [locale]);

  const value = useMemo<I18nValue>(
    () => ({ locale, t, content }),
    [locale, t, content],
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = (): I18nValue => useContext(I18nContext);
/** Interface text for the current language. */
export const useT = (): Messages => useContext(I18nContext).t;
/** Skills and exercises with text in the current language. */
export const useContent = (): Content => useContext(I18nContext).content;
export const useLocale = (): Locale => useContext(I18nContext).locale;
