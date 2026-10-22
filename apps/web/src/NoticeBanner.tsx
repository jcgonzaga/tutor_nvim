import { useT } from "./i18n/I18nProvider";
import { useProfile } from "./profile/ProfileProvider";
import { quietButton } from "./ui/styles";

export function NoticeBanner() {
  const { notice, dismissNotice } = useProfile();
  const t = useT().app.notices;
  if (notice === null) return null;
  return (
    <div
      role="alert"
      data-testid="storage-notice"
      className="flex items-center justify-between gap-4 border-b border-amber bg-panel px-8 py-3 text-[15px] text-ink"
    >
      <p>
        <span aria-hidden>⚠ </span>
        {t[notice]}
      </p>
      <button type="button" onClick={dismissNotice} className={quietButton}>
        {t.dismiss}
      </button>
    </div>
  );
}
