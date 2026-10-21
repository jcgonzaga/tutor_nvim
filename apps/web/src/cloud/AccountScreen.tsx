import { useState, type FormEvent } from "react";
import { Page } from "../ui/Page";
import { cardClass, linkClass, primaryButton, secondaryButton } from "../ui/styles";
import { AuthError } from "./auth";
import { useCloud, type SyncStatus } from "./CloudProvider";

const STATUS_TEXT: Readonly<Record<SyncStatus, string>> = {
  "signed-out": "Not syncing",
  idle: "Waiting to sync",
  syncing: "Syncing…",
  synced: "Everything is saved to your account",
  offline: "Offline: progress is saved on this device and will upload when you are back online",
  error: "Could not sync. Your progress is safe on this device; it will retry",
};

export function SyncStatusLine() {
  const { enabled, user, status } = useCloud();
  if (!enabled) return null;
  return (
    <p data-testid="sync-status" data-status={status} className="text-sm text-zinc-400">
      {user
        ? `${user.email} · ${STATUS_TEXT[status]}`
        : "Sign in to keep your progress across devices."}
    </p>
  );
}

/** Optional account (T-602): signing in never gates practice, it only adds cross-device progress. */
export function AccountScreen() {
  const cloud = useCloud();
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
      else await cloud.signUp(email, password, name || email.split("@")[0] || "Learner");
      window.location.hash = "#/";
    } catch (failure) {
      setError(
        failure instanceof AuthError ? failure.message : "Could not reach the sign-in service",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!cloud.enabled) {
    return (
      <Page title="Account">
        <p className="text-zinc-300">
          Accounts are not set up in this version. Your progress is saved on this device.
        </p>
        <a href="#/" className={linkClass}>
          Back to today
        </a>
      </Page>
    );
  }

  if (cloud.user) {
    return (
      <Page title="Account" eyebrow="Tutor NeoVim">
        <section className={`${cardClass} space-y-3`}>
          <p data-testid="account-email">{cloud.user.email}</p>
          <SyncStatusLine />
          {cloud.message ? (
            <p role="status" className="text-sm text-amber-200">
              {cloud.message}
            </p>
          ) : null}
          <div className="flex gap-3">
            <button type="button" className={secondaryButton} onClick={cloud.syncNow}>
              Sync now
            </button>
            <button type="button" className={secondaryButton} onClick={() => void cloud.signOut()}>
              Sign out
            </button>
          </div>
        </section>
        <a href="#/" className={linkClass}>
          Back to today
        </a>
      </Page>
    );
  }

  return (
    <Page title={mode === "sign-in" ? "Sign in" : "Create an account"} eyebrow="Tutor NeoVim">
      <p className="text-zinc-300">
        An account keeps your progress across devices. You can keep practicing without one.
      </p>
      <form onSubmit={submit} className={`${cardClass} space-y-4`}>
        {mode === "sign-up" ? (
          <label className="block text-sm">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-3 py-2 focus:outline-2 focus:outline-sky-400"
            />
          </label>
        ) : null}
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-3 py-2 focus:outline-2 focus:outline-sky-400"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-3 py-2 focus:outline-2 focus:outline-sky-400"
          />
        </label>
        {error ? (
          <p role="alert" data-testid="account-error" className="text-sm text-red-300">
            <span aria-hidden>✗ </span>
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy || !cloud.ready} className={primaryButton}>
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          >
            {mode === "sign-in" ? "I need an account" : "I already have an account"}
          </button>
        </div>
      </form>
      <a href="#/" className={linkClass}>
        Back to today
      </a>
    </Page>
  );
}
