import { useT } from "../i18n/I18nProvider";
import { LanguageSelect } from "../ui/LanguageSelect";
import { Page } from "../ui/Page";
import { cardClass, linkClass } from "../ui/styles";
import { playCue } from "./sound";
import { usePrefs } from "./PrefsProvider";

/** Preferences for this browser (T-901, T-903). Everything here is off until the learner turns it on. */
export function SettingsScreen({ analyticsAvailable }: { readonly analyticsAvailable: boolean }) {
  const { prefs, setSound, setAnalytics } = usePrefs();
  const t = useT();
  return (
    <Page title={t.settings.title} eyebrow={t.settings.eyebrow}>
      <section className={`${cardClass} flex max-w-[760px] flex-col gap-6`}>
        <LanguageSelect />
        <div className="space-y-1">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={prefs.sound}
              onChange={(event) => {
                setSound(event.target.checked);
                if (event.target.checked) playCue("success");
              }}
              className="size-[22px] accent-amber"
            />
            <span className="text-lg font-semibold">{t.settings.sound.label}</span>
          </label>
          <p className="pl-[34px] text-[15px] text-ink-3">{t.settings.sound.help}</p>
        </div>

        {analyticsAvailable ? (
          <div className="space-y-1">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={prefs.analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
                className="size-[22px] accent-amber"
              />
              <span className="text-lg font-semibold">{t.settings.analytics.label}</span>
            </label>
            <p className="pl-[34px] text-[15px] text-ink-3">{t.settings.analytics.help}</p>
          </div>
        ) : null}
      </section>
      <a href="#/" className={linkClass}>
        {t.settings.back}
      </a>
    </Page>
  );
}
