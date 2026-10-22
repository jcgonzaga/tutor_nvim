import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { SOURCE_LOCALE, type Locale } from "@tutor-nvim/exercise-schema";
import { contentFor, type Content } from "../exercises";
import { usePrefs } from "../prefs/PrefsProvider";
import { en } from "./en";
import { es } from "./es";
import type { Messages } from "./messages";

export const catalogs: Readonly<Record<Locale, Messages>> = { en, es };

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
  t: catalogs[SOURCE_LOCALE],
  content: contentFor(SOURCE_LOCALE),
});

/** Gives the whole app the language from the device preferences (ADR-0005). */
export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const { prefs } = usePrefs();
  const locale = prefs.language;
  const value = useMemo<I18nValue>(
    () => ({ locale, t: catalogs[locale], content: contentFor(locale) }),
    [locale],
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
