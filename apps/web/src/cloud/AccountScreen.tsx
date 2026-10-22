import { useState, type FormEvent } from "react";
import { useT } from "../i18n/I18nProvider";
import { Page } from "../ui/Page";
import { cardClass, linkClass, primaryButton, secondaryButton } from "../ui/styles";
import { AuthError } from "./auth";
import { useCloud, type CloudNotice } from "./CloudProvider";

export function SyncStatusLine() {
  const { enabled, user, status } = useCloud();
  const t = useT();
  if (!enabled) return null;
  return (
    <p data-testid="sync-status" data-status={status} className="text-[15px] text-ink-3">
      {user ? `${user.email} · ${t.cloud.status[status]}` : t.cloud.signedOutLine}
    </p>
  );
}

function noticeText(notice: CloudNotice, t: ReturnType<typeof useT>): string {
  if (notice.kind === "skipped") return t.cloud.notices.skipped(notice.count);
  if (notice.kind === "expired") return t.cloud.notices.expired;
  return notice.detail;
}

/** Optional account (T-602): signing in never gates practice, it only adds cross-device progress. */
export function AccountScreen() {
  const cloud = useCloud();
  const t = useT();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "sign-in") await cloud.signIn(email, password);
      else await cloud.signUp(email, password, name || email.split("@")[0] || t.cloud.defaultName);
      window.location.hash = "#/";
    } catch (failure) {
      if (failure instanceof AuthError) {
        setError(failure.code ? t.cloud.errors[failure.code] : failure.message);
      } else {
        setError(t.cloud.errors.unreachable);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!cloud.enabled) {
    return (
      <Page title={t.cloud.title}>
        <p className="text-ink-2">{t.cloud.notConfigured}</p>
        <a href="#/" className={linkClass}>
          {t.cloud.back}
        </a>
      </Page>
    );
  }

  if (cloud.user) {
    return (
      <Page title={t.cloud.title} eyebrow={t.common.appName}>
        <section className={`${cardClass} flex max-w-[560px] flex-col gap-4`}>
          <p data-testid="account-email">{cloud.user.email}</p>
          <SyncStatusLine />
          {cloud.message ? (
            <p role="status" className="text-[15px] text-ink-2">
              {noticeText(cloud.message, t)}
            </p>
          ) : null}
          <p className="text-[15px] text-ink-3">{t.cloud.scope}</p>
          <div className="flex gap-3">
            <button type="button" className={secondaryButton} onClick={cloud.syncNow}>
              {t.cloud.syncNow}
            </button>
            <button type="button" className={secondaryButton} onClick={() => void cloud.signOut()}>
              {t.cloud.signOut}
            </button>
          </div>
        </section>
        <a href="#/" className={linkClass}>
          {t.cloud.back}
        </a>
      </Page>
    );
  }

  return (
    <Page
      title={mode === "sign-in" ? t.cloud.signInTitle : t.cloud.signUpTitle}
      eyebrow={t.common.appName}
    >
      <p className="text-ink-2">{t.cloud.intro}</p>
      <form onSubmit={submit} className={`${cardClass} flex max-w-[560px] flex-col gap-5`}>
        {mode === "sign-up" ? (
          <label className="block text-[15px] font-semibold text-ink-2">
            {t.cloud.fields.name}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className="mt-1.5 block min-h-12 w-full rounded-lg border border-line-strong bg-raised px-3.5 py-2 text-ink"
            />
          </label>
        ) : null}
        <label className="block text-[15px] font-semibold text-ink-2">
          {t.cloud.fields.email}
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="mt-1.5 block min-h-12 w-full rounded-lg border border-line-strong bg-raised px-3.5 py-2 text-ink"
          />
        </label>
        <label className="block text-[15px] font-semibold text-ink-2">
          {t.cloud.fields.password}
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            className="mt-1.5 block min-h-12 w-full rounded-lg border border-line-strong bg-raised px-3.5 py-2 text-ink"
          />
        </label>
        {error ? (
          <p role="alert" data-testid="account-error" className="text-[15px] text-ember-ink">
            <span aria-hidden>✗ </span>
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy || !cloud.ready} className={primaryButton}>
            {mode === "sign-in" ? t.cloud.signIn : t.cloud.signUp}
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          >
            {mode === "sign-in" ? t.cloud.needAccount : t.cloud.haveAccount}
          </button>
        </div>
      </form>
      <a href="#/" className={linkClass}>
        {t.cloud.back}
      </a>
    </Page>
  );
}
