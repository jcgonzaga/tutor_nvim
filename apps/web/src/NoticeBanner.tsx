import { useProfile } from "./profile/ProfileProvider";
import { quietButton } from "./ui/styles";

const MESSAGES = {
  unreadable:
    "Your saved progress could not be read, so a fresh profile was started. The old data was kept as a backup in this browser.",
  unsaved:
    "This browser is not letting the app save. You can keep practicing, but progress will be lost when you close the tab.",
} as const;

export function NoticeBanner() {
  const { notice, dismissNotice } = useProfile();
  if (notice === null) return null;
  return (
    <div
      role="alert"
      data-testid="storage-notice"
      className="flex items-center justify-between gap-4 border-b border-amber bg-panel px-8 py-3 text-[15px] text-ink"
    >
      <p>
        <span aria-hidden>⚠ </span>
        {MESSAGES[notice]}
      </p>
      <button type="button" onClick={dismissNotice} className={quietButton}>
        Dismiss
      </button>
    </div>
  );
}
