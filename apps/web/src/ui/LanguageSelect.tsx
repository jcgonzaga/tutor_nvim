import { LOCALES, type Locale } from "@tutor-nvim/exercise-schema";
import { useId } from "react";
import { useT } from "../i18n/I18nProvider";
import { usePrefs } from "../prefs/PrefsProvider";
import { inputClass } from "./styles";

/** Each language is named in itself, so it can be found whatever language is on screen. */
const NAMES: Readonly<Record<Locale, string>> = { es: "Español", en: "English" };

/** Language of the interface and the exercise text (ADR-0005). Applies immediately. */
export function LanguageSelect() {
  const t = useT();
  const { prefs, setLanguage } = usePrefs();
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-lg font-semibold">
        {t.common.language.label}
      </label>
      <select
        id={id}
        value={prefs.language}
        onChange={(event) => setLanguage(event.target.value as Locale)}
        className={`${inputClass} max-w-[260px]`}
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {NAMES[locale]}
          </option>
        ))}
      </select>
      <p className="text-[15px] text-ink-3">{t.common.language.help}</p>
    </div>
  );
}
