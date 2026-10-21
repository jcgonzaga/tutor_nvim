import { Page } from "../ui/Page";
import { cardClass, linkClass } from "../ui/styles";
import { playCue } from "./sound";
import { usePrefs } from "./PrefsProvider";

/** Preferences for this browser (T-901, T-903). Everything here is off until the learner turns it on. */
export function SettingsScreen({ analyticsAvailable }: { readonly analyticsAvailable: boolean }) {
  const { prefs, setSound, setAnalytics } = usePrefs();
  return (
    <Page title="Settings" eyebrow="Tutor NeoVim">
      <section className={`${cardClass} flex max-w-[760px] flex-col gap-6`}>
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
            <span className="text-lg font-semibold">Sound</span>
          </label>
          <p className="pl-[34px] text-[15px] text-ink-3">
            Short tones when you finish an exercise. Nothing depends on them: every result is also
            shown on screen. Off by default.
          </p>
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
              <span className="text-lg font-semibold">Share anonymous usage data</span>
            </label>
            <p className="pl-[34px] text-[15px] text-ink-3">
              Helps improve the exercises. It sends which exercises and skills were started, solved
              or failed, hints used, and timings, under a random id for this browser. It never sends
              what you type, your text, your name or your e-mail. Off by default; turn it off any
              time.
            </p>
          </div>
        ) : null}
      </section>
      <a href="#/" className={linkClass}>
        Back to today
      </a>
    </Page>
  );
}
