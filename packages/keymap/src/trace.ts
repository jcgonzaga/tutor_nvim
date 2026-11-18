import type { KeymapBinding, KeymapMode } from "@tutor-nvim/exercise-schema";

import {
  IDLE_KEYMAP_STATE,
  resolveKeymapKey,
  type KeymapCatalog,
  type KeymapState,
  type ResolveOptions,
} from "./resolve";

/**
 * An action a recorded key sequence completed (S6), and what it cost.
 *
 * `layerId` is the enabled layer that claimed the keys; `sourceId` is the layer the binding was
 * written in, which inheritance can make different (an inherited tmux binding still says `tmux`).
 */
export interface TracedAction {
  readonly action: KeymapBinding["action"];
  readonly target: KeymapBinding["target"];
  readonly layerId: string;
  readonly sourceId: string;
  readonly binding: KeymapBinding;
  /** The keys it consumed, opener included: `C-b` then `%`. */
  readonly keys: readonly string[];
  /** What they cost: their count, the unit the strategy rule divides by. */
  readonly cost: number;
  /** Index of the first token it consumed, so the caller can map it back to the attempt. */
  readonly tokenIndex: number;
}

/** A key no enabled layer claimed: reported, never turned into an action. */
export interface UnclaimedKey {
  readonly tokenIndex: number;
  readonly key: string;
}

export interface KeymapTrace {
  readonly actions: readonly TracedAction[];
  readonly unclaimed: readonly UnclaimedKey[];
  /** Where the replay ended: a sequence still open stays open, so the caller can continue it. */
  readonly state: KeymapState;
}

export interface TraceOptions extends ResolveOptions {
  /**
   * The mode each token was pressed in, for a recorded attempt that changes mode halfway. Without
   * it the whole replay uses `mode`, which is right for a written key sequence and wrong for one
   * typed through INSERT.
   */
  readonly modeAt?: (tokenIndex: number) => KeymapMode;
}

/**
 * Replays a recorded key sequence through `resolveKeymapKey` and reports what it completed (S6).
 *
 * Pure, and only as faithful as the resolver: a key no layer claims closes the open sequence and is
 * reported as unclaimed, exactly as pressing it would, and the replay carries on from rest so the
 * keys after it are still read. Nothing here guesses an action: only a binding the resolver
 * completed is reported, so a layer's keys can never be invented for it.
 */
export function traceKeymapActions(
  tokens: readonly string[],
  catalogs: readonly KeymapCatalog[],
  options: TraceOptions = {},
): KeymapTrace {
  const actions: TracedAction[] = [];
  const unclaimed: UnclaimedKey[] = [];
  let state: KeymapState = IDLE_KEYMAP_STATE;
  /** The keys consumed by the sequence in progress, opener included. */
  let consumed: string[] = [];
  let startedAt = 0;
  tokens.forEach((token, tokenIndex) => {
    if (state.layerId === null) {
      consumed = [];
      startedAt = tokenIndex;
    }
    const mode = options.modeAt?.(tokenIndex) ?? options.mode;
    const outcome = resolveKeymapKey(state, token, catalogs, { mode });
    state = outcome.state;
    if (outcome.kind === "not-accepted") {
      unclaimed.push({ tokenIndex, key: token });
      consumed = [];
      return;
    }
    consumed = [...consumed, token];
    if (outcome.kind === "pending") return;
    actions.push({
      action: outcome.action,
      target: outcome.target,
      layerId: outcome.layerId,
      sourceId: outcome.sourceId,
      binding: outcome.binding,
      keys: consumed,
      cost: consumed.length,
      tokenIndex: startedAt,
    });
    consumed = [];
  });
  return { actions, unclaimed, state };
}
