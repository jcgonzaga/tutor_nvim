import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { KeyValueStorage } from "../storage/profileStore";
import type { Locale } from "@tutor-nvim/exercise-schema";
import {
  loadPrefs,
  savePrefs,
  withAnalytics,
  withLanguage,
  withLessonSeen,
  type Prefs,
} from "./prefs";

interface PrefsContextValue {
  readonly prefs: Prefs;
  setSound(on: boolean): void;
  setAnalytics(on: boolean): void;
  setLanguage(language: Locale): void;
  /** Records that a skill's theory cards were shown, so they do not appear again. */
  markLessonSeen(skillId: string): void;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

export function PrefsProvider({
  storage,
  children,
}: {
  readonly storage: KeyValueStorage;
  readonly children: ReactNode;
}) {
  const [prefs, setPrefs] = useState(() => loadPrefs(storage));

  const apply = useCallback(
    (next: (current: Prefs) => Prefs) => {
      setPrefs((current) => {
        const updated = next(current);
        savePrefs(storage, updated);
        return updated;
      });
    },
    [storage],
  );

  const value = useMemo<PrefsContextValue>(
    () => ({
      prefs,
      setSound: (on) => apply((current) => ({ ...current, sound: on })),
      setAnalytics: (on) =>
        apply((current) => withAnalytics(current, on, () => crypto.randomUUID())),
      setLanguage: (language) => apply((current) => withLanguage(current, language)),
      markLessonSeen: (skillId) => apply((current) => withLessonSeen(current, skillId)),
    }),
    [prefs, apply],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const value = useContext(PrefsContext);
  if (value === null) throw new Error("usePrefs must be used inside <PrefsProvider>");
  return value;
}
