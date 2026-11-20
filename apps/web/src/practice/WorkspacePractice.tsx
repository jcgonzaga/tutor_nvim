import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatKey } from "@tutor-nvim/vim-engine";
import { IDLE_KEYMAP_STATE, pendingKeys, type KeymapState } from "@tutor-nvim/keymap";
import type { KeymapSurface, WorkspaceExercise } from "@tutor-nvim/exercise-schema";
import { useT } from "../i18n/I18nProvider";
import { shouldPreventDefault, toKeyInput } from "../input/keyboard";
import { keymapLayers } from "../keymaps";
import { usePrefs } from "../prefs/PrefsProvider";
import { LayerRail } from "./LayerRail";
import { PracticeFrame } from "./PracticeFrame";
import { PracticeHints } from "./PracticeHints";
import { PracticeResult } from "./PracticeResult";
import { WorkspacePanes } from "./WorkspacePane";
import { enabledCatalogs } from "./layerRailModel";
import { usePracticeScreen, type FinishedPractice } from "./usePracticeScreen";
import { focusedSurface, resolveWorkspaceKey, resolverMode } from "./workspaceKeys";
import {
  activeTab,
  focusLeafIndex,
  focusedNode,
  windowPaths,
  zoomedPath,
  type WorkspaceState,
} from "./workspaceEngine";

interface WorkspacePracticeProps {
  readonly exercise: WorkspaceExercise;
  readonly eyebrow?: string | undefined;
  readonly progress?: string | undefined;
  readonly onFinish?: ((finished: FinishedPractice) => void) | undefined;
  readonly giveUpLabel?: string | undefined;
  readonly renderResult?:
    ((finished: FinishedPractice, retry: () => void) => ReactNode) | undefined;
  readonly onStart?: (() => void) | undefined;
  readonly onHint?: ((level: number) => void) | undefined;
  readonly combo?: number | undefined;
  readonly nextSlug?: string | null | undefined;
}

/** No keystroke was typed: the rail labels an attempt, not the absence of one. */
const NO_EVENTS = [] as const;

const keycapClass =
  "rounded-md border border-line-strong border-b-2 bg-raised px-1.5 py-0.5 font-mono text-[12.5px] text-ink";

/**
 * A workspace exercise, practised (T8).
 *
 * The keys arrive in two shapes, and the order matters. A key an enabled layer claims and the engine
 * can apply becomes an action (`recordWorkspaceAction`); everything else goes to `dispatchWorkspace`,
 * which is what types into the focused buffer or the focused terminal's command line. Nothing here
 * interprets a key twice: the resolver only decides *which* of the two paths a press takes.
 *
 * The panes are drawn from the engine's tree, focus path and ratios, so the view cannot disagree with
 * the objective about the layout the learner sees. Everything the state says in words — the mode, the
 * surface, the session, the zoom — is in the footer beside the panes, because a focus ring alone
 * would be colour-only (AGENTS.md 19).
 */
export function WorkspacePractice({
  exercise,
  eyebrow,
  progress,
  onFinish,
  giveUpLabel,
  renderResult,
  onStart,
  onHint,
  combo = 0,
  nextSlug = null,
}: WorkspacePracticeProps) {
  const t = useT();
  const { prefs } = usePrefs();
  const {
    attempt,
    hints,
    hintReady,
    finished,
    finishedPractice,
    refusal,
    sendWorkspaceKey,
    sendWorkspaceAction,
    requestHint,
    giveUp,
    reset,
  } = usePracticeScreen(exercise, { onStart, onFinish });

  // The attempt of a workspace exercise is a workspace attempt; the guard keeps the narrowing honest
  // without asserting a type the screen cannot prove.
  const workspace = attempt.kind === "workspace" ? attempt : null;
  const [keymap, setKeymap] = useState<KeymapState>(IDLE_KEYMAP_STATE);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const surface: KeymapSurface = workspace === null ? "editor" : focusedSurface(workspace.state);
  const catalogs = useMemo(
    () => enabledCatalogs(keymapLayers, prefs.enabledLayers, surface),
    [prefs.enabledLayers, surface],
  );

  // The practice area owns the keyboard on arrival and again after "Try again".
  useEffect(() => {
    editorRef.current?.focus();
  }, [attempt.startedAt]);

  useEffect(() => {
    // The panes are frozen once the attempt ended: hand keyboard focus to the next action.
    if (finished) resultRef.current?.querySelector<HTMLElement>("button, a")?.focus();
  }, [finished]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (workspace === null) return;
    const input = toKeyInput(event.nativeEvent, performance.now());
    if (input === null) return;
    setLastKey(formatKey(input));
    const decision = resolveWorkspaceKey(keymap, input, catalogs, resolverMode(workspace.state));
    setKeymap(decision.keymap);
    // A key a layer resolved must not also reach the browser: `C-w` would close the tab and the
    // practice area would lose the very pane it just acted on.
    if (decision.pending || decision.action !== null || shouldPreventDefault(input, "vim")) {
      event.preventDefault();
    }
    if (decision.action !== null) {
      sendWorkspaceAction(decision.action);
      return;
    }
    if (decision.dispatch) sendWorkspaceKey(input);
  }

  function handleHint() {
    if (hints.next) onHint?.(hints.next.hint.level);
    requestHint();
    editorRef.current?.focus();
  }

  /**
   * "Try again" starts the exercise over, so a half-pressed prefix from the last attempt goes with
   * it: resuming `C-w` against a fresh workspace would act on keys the learner never pressed here.
   */
  function handleRetry() {
    setKeymap(IDLE_KEYMAP_STATE);
    setLastKey(null);
    reset();
  }

  if (workspace === null) return null;

  return (
    <PracticeFrame
      eyebrow={eyebrow}
      progress={progress}
      instruction={exercise.instruction}
      rail={<LayerRail exercise={exercise} events={NO_EVENTS} />}
    >
      <div className="group flex flex-col gap-3">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div
            ref={editorRef}
            role="application"
            aria-label={t.practice.workspace.label}
            aria-describedby="instruction"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className="focus-visible:outline-offset-[-2px]"
          >
            <WorkspacePanes state={workspace.state} />
          </div>
          <WorkspaceFooter
            state={workspace.state}
            keymap={keymap}
            actions={workspace.actions.length}
            lastKey={lastKey}
            refusal={refusal}
            combo={combo}
          />
        </div>
        <p className="text-sm text-ink-3 group-focus-within:invisible">{t.practice.focusHint}</p>
      </div>

      {!finished && (exercise.hints.length > 0 || giveUpLabel) ? (
        <PracticeHints
          revealed={hints.revealed}
          hasNext={hints.next !== null}
          hintReady={hintReady}
          onHint={handleHint}
          giveUpLabel={giveUpLabel}
          onGiveUp={giveUp}
        />
      ) : null}

      {finishedPractice ? (
        <PracticeResult
          finished={finishedPractice}
          exercise={exercise}
          onRetry={handleRetry}
          nextSlug={nextSlug}
          renderResult={renderResult}
          resultRef={resultRef}
        />
      ) : null}
    </PracticeFrame>
  );
}

interface WorkspaceFooterProps {
  readonly state: WorkspaceState;
  readonly keymap: KeymapState;
  readonly actions: number;
  readonly lastKey: string | null;
  readonly refusal: { readonly reason: string | null } | null;
  readonly combo: number;
}

/**
 * What the workspace is in, in words: the input mode, which surface has the keys, the session, the
 * focused pane, the zoom, the command line being typed and how many actions the attempt cost.
 *
 * It is the same row the vim and shell views put their mode and pending command in, so a refused key
 * shows up where a learner already looks for one.
 */
function WorkspaceFooter({
  state,
  keymap,
  actions,
  lastKey,
  refusal,
  combo,
}: WorkspaceFooterProps) {
  const t = useT();
  const tab = activeTab(state);
  const focusIndex = focusLeafIndex(state);
  const labels = windowPaths(state);
  const focused = tab === undefined ? undefined : focusedNode(tab);
  const surface =
    focused !== undefined && focused.kind === "terminal"
      ? t.practice.workspace.surfaces.terminal
      : t.practice.workspace.surfaces.editor;
  const zoom = zoomedPath(state);
  const pending = pendingKeys(keymap);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line bg-sunken px-4 py-2.5 font-mono text-sm">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
        <span
          data-testid="workspace-mode"
          aria-label={t.practice.workspace.modeLabel}
          className="rounded-md border border-line-strong px-2.5 py-1 text-sm font-bold tracking-[0.04em] text-ink-2"
        >
          {state.mode === "resize"
            ? t.practice.workspace.modes.resize
            : t.practice.workspace.modes.normal}
        </span>
        <span
          data-testid="workspace-surface"
          aria-label={t.practice.workspace.surfaceLabel}
          className="text-ink-3"
        >
          {surface}
        </span>
        <span
          data-testid="workspace-session"
          aria-label={t.practice.workspace.sessionLabel}
          className={state.detached ? "font-bold text-ink" : "text-ink-2"}
        >
          {state.detached
            ? t.practice.workspace.session.detached
            : t.practice.workspace.session.attached}
        </span>
        <span
          data-testid="workspace-focus"
          aria-label={t.practice.workspace.focusLabel}
          className="text-ink-2"
        >
          {t.practice.workspace.pane((focusIndex ?? 0) + 1, labels.length)}{" "}
          <span className="text-ink">{labels[focusIndex ?? 0] ?? ""}</span>
        </span>
        <span
          data-testid="workspace-zoom"
          aria-label={t.practice.workspace.zoomLabel}
          className="text-ink-3"
        >
          {zoom === null ? t.practice.workspace.zoomNone : t.practice.workspace.zoomedPane(zoom)}
        </span>
        {state.pending !== null ? (
          <output
            data-testid="workspace-command-line"
            aria-label={t.practice.workspace.commandLine}
            aria-live="off"
            className="text-ink"
          >
            :{state.pending.text}
          </output>
        ) : null}
        {pending.length > 0 ? (
          <span
            data-testid="workspace-pending-keys"
            aria-label={t.practice.workspace.pendingKeys}
            className="inline-flex flex-wrap items-center gap-1"
          >
            {pending.map((token, index) => (
              <kbd key={`${index}-${token}`} className={keycapClass}>
                {token}
              </kbd>
            ))}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-ink-2">
        {refusal !== null ? (
          <span role="status" className="flex flex-wrap items-center gap-1.5 text-ember-ink">
            <svg
              aria-hidden
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
            {t.practice.notAccepted(lastKey ?? "")}
            {refusal.reason !== null ? <span className="text-ink-3">{refusal.reason}</span> : null}
          </span>
        ) : null}
        {combo > 0 ? (
          <span data-testid="combo">
            {t.practice.combo} <strong className="text-ink">×{combo}</strong>
          </span>
        ) : null}
        <span data-testid="workspace-actions">{t.practice.workspace.actions(actions)}</span>
      </div>
    </div>
  );
}
