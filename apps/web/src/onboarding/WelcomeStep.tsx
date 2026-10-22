import { useCloud } from "../cloud/CloudProvider";
import { useT } from "../i18n/I18nProvider";
import { KeyHint } from "../ui/Kbd";
import { LanguageSelect } from "../ui/LanguageSelect";
import { linkClass, primaryButton } from "../ui/styles";

export function WelcomeStep({ onNext }: { readonly onNext: () => void }) {
  const cloud = useCloud();
  const t = useT().onboarding.welcome;
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <p className="text-lg text-ink-2">{t.intro}</p>
      <p className="text-[15px] text-ink-3">{t.local}</p>
      <LanguageSelect />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <button type="button" autoFocus onClick={onNext} className={`${primaryButton} !pr-3`}>
          {t.getStarted}
          <KeyHint>Enter</KeyHint>
        </button>
        {cloud.enabled && !cloud.user ? (
          <a href="#/account" className={linkClass}>
            {t.haveAccount}
          </a>
        ) : null}
      </div>
    </div>
  );
}
