import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Attempt } from "@tutor-nvim/evaluation";
import type { Exercise } from "@tutor-nvim/exercise-schema";
import type { ActiveSession, Profile } from "@tutor-nvim/pedagogy";
import { useProfile } from "../profile/ProfileProvider";
import type { KeyValueStorage } from "../storage/profileStore";
import { createCloudApi } from "./api";
import type { AuthClient, AuthUser } from "./auth";
import type { CloudConfig } from "./config";
import { enqueueAttempt, enqueueSession, loadOutbox, saveOutbox, type Outbox } from "./outbox";
import { sessionIdOf, toAttemptSubmission, toSessionSubmission } from "./submission";
import { runSync } from "./sync";

export type SyncStatus = "signed-out" | "idle" | "syncing" | "synced" | "offline" | "error";

interface CloudContextValue {
  /** False when no API is configured: the app is purely local and shows nothing about the cloud. */
  readonly enabled: boolean;
  readonly user: AuthUser | null;
  readonly status: SyncStatus;
  readonly message: string | null;
  /** True once the auth client has said who (if anyone) is signed in. */
  readonly ready: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string): Promise<void>;
  signOut(): Promise<void>;
  /** Queues a finished attempt for the server. Cheap and synchronous: safe to call from an event. */
  recordAttempt(
    exercise: Pick<Exercise, "id">,
    finished: { attempt: Attempt; success: boolean },
    at: number,
    session?: ActiveSession | null,
  ): void;
  /** Queues the summary of a session (finished or abandoned). */
  recordSession(
    profile: Profile,
    session: ActiveSession,
    options: { finishedAt: number; abandoned: boolean },
  ): void;
  syncNow(): void;
}

const DISABLED: CloudContextValue = {
  enabled: false,
  user: null,
  status: "signed-out",
  message: null,
  ready: true,
  signIn: async () => undefined,
  signUp: async () => undefined,
  signOut: async () => undefined,
  recordAttempt: () => undefined,
  recordSession: () => undefined,
  syncNow: () => undefined,
};

const CloudContext = createContext<CloudContextValue>(DISABLED);
export const useCloud = (): CloudContextValue => useContext(CloudContext);

const SYNC_DEBOUNCE_MS = 800;
const SYNC_INTERVAL_MS = 5 * 60_000;

interface CloudProviderProps {
  readonly config: CloudConfig | null;
  readonly storage: KeyValueStorage;
  readonly loadAuth: (config: CloudConfig) => Promise<AuthClient>;
  readonly children: ReactNode;
}

/**
 * Optional cloud sync (T-608). Practice never waits on it: attempts are applied locally first, then
 * queued in the outbox and uploaded in the background. With no configuration this renders its
 * children unchanged and the app is the local product of M5.
 */
export function CloudProvider({ config, storage, loadAuth, children }: CloudProviderProps) {
  if (config === null) return <>{children}</>;
  return (
    <ActiveCloud config={config} storage={storage} loadAuth={loadAuth}>
      {children}
    </ActiveCloud>
  );
}

function ActiveCloud({
  config,
  storage,
  loadAuth,
  children,
}: CloudProviderProps & { config: CloudConfig }) {
  const { getProfile, update } = useProfile();
  const [auth, setAuth] = useState<AuthClient | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SyncStatus>("signed-out");
  const [message, setMessage] = useState<string | null>(null);

  const outbox = useRef<Outbox>(loadOutbox(storage));
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setOutbox = useCallback(
    (next: Outbox) => {
      outbox.current = next;
      saveOutbox(storage, next);
    },
    [storage],
  );

  useEffect(() => {
    let cancelled = false;
    loadAuth(config)
      .then(async (client) => {
        const current = await client.currentUser().catch(() => null);
        if (cancelled) return;
        setAuth(client);
        setUser(current);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [config, loadAuth]);

  const api = useMemo(
    () => (auth ? createCloudApi({ baseUrl: config.apiUrl, token: () => auth.token() }) : null),
    [auth, config.apiUrl],
  );

  const syncNow = useCallback(() => {
    if (!api || !user) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    void (async () => {
      // Work queued while a sync was running asks for another pass instead of a parallel one.
      do {
        again.current = false;
        setStatus("syncing");
        const outcome = await runSync({
          api,
          getProfile,
          getOutbox: () => outbox.current,
          setOutbox,
          updateProfile: (transition) => {
            update(transition);
          },
        });
        if (outcome.status === "synced") {
          setStatus("synced");
          setMessage(
            outcome.rejected > 0
              ? `${outcome.rejected} attempt(s) could not be saved and were skipped.`
              : null,
          );
        } else if (outcome.status === "signed-out") {
          setStatus("signed-out");
          setUser(null);
          setMessage("Your sign-in expired. Sign in again to keep syncing.");
        } else if (outcome.status === "offline") {
          setStatus("offline");
          setMessage(null);
        } else {
          setStatus("error");
          setMessage(outcome.message);
        }
      } while (again.current);
      running.current = false;
    })();
  }, [api, user, getProfile, update, setOutbox]);

  const syncSoon = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(syncNow, SYNC_DEBOUNCE_MS);
  }, [syncNow]);

  // Sync when someone signs in, when the network comes back, and now and then while the app is open.
  useEffect(() => {
    if (!user || !api) return;
    syncNow();
    const onOnline = () => syncNow();
    window.addEventListener("online", onOnline);
    const interval = setInterval(syncNow, SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [user, api, syncNow]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const value = useMemo<CloudContextValue>(
    () => ({
      enabled: true,
      user,
      status: user ? status : "signed-out",
      message,
      ready,
      async signIn(email, password) {
        if (!auth) throw new Error("Sign-in is not available yet");
        setUser(await auth.signIn(email, password));
      },
      async signUp(email, password, name) {
        if (!auth) throw new Error("Sign-in is not available yet");
        setUser(await auth.signUp(email, password, name));
      },
      async signOut() {
        await auth?.signOut();
        setUser(null);
        setStatus("signed-out");
        setMessage(null);
      },
      recordAttempt(exercise, finished, at, session) {
        const profile = getProfile();
        setOutbox(
          enqueueAttempt(
            outbox.current,
            toAttemptSubmission(exercise, finished.attempt, {
              id: crypto.randomUUID(),
              finishedAt: at,
              solved: finished.success,
              sessionId: session ? sessionIdOf(profile, session) : null,
            }),
          ),
        );
        syncSoon();
      },
      recordSession(profile, session, options) {
        setOutbox(enqueueSession(outbox.current, toSessionSubmission(profile, session, options)));
        syncSoon();
      },
      syncNow,
    }),
    [user, status, message, ready, auth, getProfile, setOutbox, syncSoon, syncNow],
  );

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}
