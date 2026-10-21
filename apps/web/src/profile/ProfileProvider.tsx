import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createProfile, type Profile } from "@tutor-nvim/pedagogy";
import { systemClock, type Clock } from "../clock";
import {
  loadProfile,
  saveProfile,
  type KeyValueStorage,
  type LoadResult,
} from "../storage/profileStore";

export type StorageNotice = "unreadable" | "unsaved" | null;

interface ProfileContextValue {
  readonly profile: Profile;
  readonly clock: Clock;
  /** Something the learner should know about: stored progress was unreadable, or saving failed. */
  readonly notice: StorageNotice;
  /** The latest profile, including changes made earlier in the same event. */
  readonly getProfile: () => Profile;
  /** Applies a pure profile transition and saves the result. */
  readonly update: (transition: (profile: Profile) => Profile) => Profile;
  readonly dismissNotice: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

const newUserId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `local-${Date.now().toString(36)}`;

function initialProfile(
  storage: KeyValueStorage,
  clock: Clock,
): { profile: Profile; notice: StorageNotice } {
  const loaded: LoadResult = loadProfile(storage);
  if (loaded.status === "loaded") return { profile: loaded.profile, notice: null };
  return {
    profile: createProfile(newUserId(), clock.now()),
    notice: loaded.status === "unreadable" ? "unreadable" : null,
  };
}

interface ProfileProviderProps {
  readonly storage: KeyValueStorage;
  readonly clock?: Clock;
  readonly children: ReactNode;
}

/**
 * Holds the learner's profile (React state only; every rule lives in `@tutor-nvim/pedagogy`).
 * A transition is applied to the latest profile through a ref, so two updates in the same event
 * cannot overwrite each other, and the result is written to storage right away: closing the tab
 * after any exercise loses nothing. Nothing here touches the network.
 */
export function ProfileProvider({ storage, clock = systemClock, children }: ProfileProviderProps) {
  const [initial] = useState(() => initialProfile(storage, clock));
  const [profile, setProfile] = useState(initial.profile);
  const [notice, setNotice] = useState<StorageNotice>(initial.notice);
  const latest = useRef(initial.profile);

  const update = useCallback(
    (transition: (profile: Profile) => Profile): Profile => {
      const next = transition(latest.current);
      latest.current = next;
      setProfile(next);
      if (!saveProfile(storage, next)) setNotice("unsaved");
      return next;
    },
    [storage],
  );
  const dismissNotice = useCallback(() => setNotice(null), []);
  const getProfile = useCallback(() => latest.current, []);

  const value = useMemo(
    () => ({ profile, clock, notice, getProfile, update, dismissNotice }),
    [profile, clock, notice, getProfile, update, dismissNotice],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const value = useContext(ProfileContext);
  if (value === null) throw new Error("useProfile must be used inside <ProfileProvider>");
  return value;
}
