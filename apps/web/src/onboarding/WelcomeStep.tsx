import { useCloud } from "../cloud/CloudProvider";
import { linkClass, primaryButton } from "../ui/styles";

export function WelcomeStep({ onNext }: { readonly onNext: () => void }) {
  const cloud = useCloud();
  return (
    <div className="space-y-4">
      <p className="text-zinc-300">
        You will learn Vim by doing: short exercises on a real keyboard, a few minutes a day. Two
        quick questions and a short check set where you start.
      </p>
      <p className="text-sm text-zinc-400">
        Everything stays on this device. No account is needed.
      </p>
      <div className="flex flex-wrap items-center gap-6">
        <button type="button" autoFocus onClick={onNext} className={primaryButton}>
          Get started
        </button>
        {cloud.enabled && !cloud.user ? (
          <a href="#/account" className={linkClass}>
            I already have an account
          </a>
        ) : null}
      </div>
    </div>
  );
}
