import { useCloud } from "../cloud/CloudProvider";
import { KeyHint } from "../ui/Kbd";
import { linkClass, primaryButton } from "../ui/styles";

export function WelcomeStep({ onNext }: { readonly onNext: () => void }) {
  const cloud = useCloud();
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <p className="text-lg text-ink-2">
        You will learn Vim by doing: short exercises on a real keyboard, a few minutes a day. Two
        quick questions and a short check set where you start.
      </p>
      <p className="text-[15px] text-ink-3">
        Everything stays on this device. No account is needed.
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <button type="button" autoFocus onClick={onNext} className={`${primaryButton} !pr-3`}>
          Get started
          <KeyHint>Enter</KeyHint>
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
