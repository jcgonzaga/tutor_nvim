import { useMemo } from "react";
import type { Exercise, KeymapLayer, KeymapSurface } from "@tutor-nvim/exercise-schema";
import type { InputEvent } from "@tutor-nvim/evaluation";
import { useT } from "../i18n/I18nProvider";
import { keymapLayers } from "../keymaps";
import { usePrefs } from "../prefs/PrefsProvider";
import { EXAMPLE_ACTION, costRows, enabledCatalogs, keyClaim } from "./layerRailModel";

interface LayerRailProps {
  readonly exercise: Exercise;
  /** Every keystroke of the attempt, in order. The rail labels them; it never alters or blocks them. */
  readonly events: readonly InputEvent[];
  /** Catalogs to read. Content by default; a caller may hand over a different set. */
  readonly layers?: readonly KeymapLayer[];
}

const sectionClass = "rounded-2xl border border-line bg-surface p-3.5";
const keycapClass =
  "rounded-md border border-line-strong border-b-2 bg-raised px-1.5 py-0.5 font-mono text-[12.5px] text-ink";

function Keycaps({ tokens }: { readonly tokens: readonly string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {tokens.map((token, index) => (
        <kbd key={`${index}-${token}`} data-keycap={token} className={keycapClass}>
          {token}
        </kbd>
      ))}
    </span>
  );
}

/**
 * The layer rail of the practice screen (`design/app-shell/02-practica-capas.html`, T6): which tool
 * layers are on, which enabled layer owns the next key, and what each one charges for the action the
 * exercise asks for.
 *
 * Every label is read from the catalogs in `content/keymaps`; switching a layer only saves the
 * choice in `prefs.enabledLayers`, so it survives a reload. The rail never changes what the attempt
 * is judged by: the resolver is used to label a key, not to accept or reject it.
 */
export function LayerRail({ exercise, events, layers = keymapLayers }: LayerRailProps) {
  const t = useT();
  const { prefs, setLayer } = usePrefs();
  const focus: KeymapSurface = exercise.kind === "shell" ? "shell" : "editor";
  const catalogs = useMemo(
    () => enabledCatalogs(layers, prefs.enabledLayers, focus),
    [layers, prefs.enabledLayers, focus],
  );
  const claim = useMemo(() => keyClaim(catalogs, events), [catalogs, events]);

  const asked = exercise.actionSolutions[0]?.action;
  const action = asked ?? EXAMPLE_ACTION;
  const rows = useMemo(() => costRows(catalogs, action), [catalogs, action]);
  const enabledCount = layers.filter((layer) => prefs.enabledLayers.includes(layer.id)).length;

  return (
    <aside
      data-testid="layer-rail"
      aria-labelledby="rail-h"
      className="flex w-full flex-col gap-3 lg:w-[300px] lg:flex-none"
    >
      <section className={`${sectionClass} pb-3`}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="rail-h" className="text-[16px] font-extrabold tracking-[-0.01em]">
            {t.practice.layers.title}
          </h2>
          <span data-testid="rail-count" className="text-xs font-semibold text-ink-3">
            {t.practice.layers.count(enabledCount, layers.length)}
          </span>
        </div>
        <p className="mb-2.5 mt-1 text-[12.5px] text-ink-3">{t.practice.layers.note}</p>
        <ul className="flex flex-col">
          {layers.map((layer) => {
            const on = prefs.enabledLayers.includes(layer.id);
            const opener =
              [layer.prefix, layer.leader].filter((part) => part !== undefined).join(" ") || null;
            return (
              <li
                key={layer.id}
                data-layer={layer.id}
                className="border-t border-line-faint py-2 first:border-t-0 first:pt-0"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[15px] font-bold ${on ? "text-ink" : "text-ink-2"}`}>
                    {layer.label}
                  </span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${layer.label}, ${layer.owns
                      .map((surface) => t.practice.layers.surfaces[surface])
                      .join(", ")}`}
                    onClick={() => setLayer(layer.id, !on)}
                    className={`relative h-5 w-9 flex-none rounded-full border ${
                      on ? "border-amber-hi bg-amber" : "border-line-strong bg-panel"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`absolute top-0.5 size-3.5 rounded-full ${
                        on ? "left-[18px] bg-amber-ink" : "left-0.5 bg-ink-3"
                      }`}
                    />
                  </button>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-ink-3">
                  <span className="font-bold uppercase tracking-[0.08em]">
                    {layer.owns.map((surface) => t.practice.layers.surfaces[surface]).join(", ")}
                  </span>
                  <span aria-hidden className="text-dash">
                    ·
                  </span>
                  <span className={on ? "font-bold text-amber-hi" : "font-bold"}>
                    {on ? t.practice.layers.on : t.practice.layers.off}
                  </span>
                  <span className="ml-auto whitespace-nowrap font-mono text-ink-2">
                    {opener ?? t.practice.layers.noOpener}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-2.5 border-t border-line-faint pt-2 text-xs text-ink-3">
          {t.practice.layers.foot}
        </p>
      </section>

      <section
        aria-labelledby="owner-h"
        className={`${sectionClass} border-line-strong px-3.5 py-2.5`}
      >
        <span
          id="owner-h"
          className="block text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-3"
        >
          {t.practice.layers.ownerTag}
        </span>
        <p
          data-testid="key-owner"
          aria-live="polite"
          className="mt-0.5 text-[16px] font-semibold text-ink-2"
        >
          {claim.owner !== null ? (
            <>
              {t.practice.layers.ownerPrefix}{" "}
              <b className="font-extrabold text-ink">{claim.owner.label}</b>.
            </>
          ) : claim.pressed ? (
            <span className="inline-flex items-start gap-1.5 font-bold text-ember-ink">
              <svg
                aria-hidden
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                className="mt-1 flex-none"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
              {t.practice.layers.none}
            </span>
          ) : (
            <span className="text-[14px] font-normal text-ink-3">{t.practice.layers.waiting}</span>
          )}
        </p>
        {claim.keys.length > 0 ? (
          <span data-testid="owner-keys" className="mt-1 inline-flex flex-wrap items-center gap-1">
            <Keycaps tokens={claim.keys} />
          </span>
        ) : null}
      </section>

      <section aria-labelledby="cost-h" className={`${sectionClass} bg-panel px-3.5 pb-2.5 pt-3`}>
        <div className="flex items-baseline gap-2">
          <h2 id="cost-h" className="text-[15px] font-extrabold tracking-[-0.01em]">
            {t.practice.layers.costTitle}
          </h2>
          <span className="text-xs text-ink-3">{t.practice.layers.costSub}</span>
        </div>
        <p data-testid="cost-action" className="mt-0.5 font-mono text-[12.5px] text-ink-2">
          {action}
        </p>
        <table className="mt-1 w-full border-collapse">
          <caption className="sr-only">{t.practice.layers.costCaption(action)}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-line-faint pb-1 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3"
              >
                {t.practice.layers.costLayer}
              </th>
              <th
                scope="col"
                className="border-b border-line-faint pb-1 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3"
              >
                {t.practice.layers.costKeys}
              </th>
              <th
                scope="col"
                className="border-b border-line-faint pb-1 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-ink-3"
              >
                {t.practice.layers.costColumn}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr data-testid="cost-empty">
                <td colSpan={3} className="py-2 text-[13.5px] text-ink-2">
                  {t.practice.layers.costEmpty(action)}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.layerId}
                  data-testid="cost-row"
                  data-layer={row.layerId}
                  className="border-b border-line-faint last:border-b-0"
                >
                  <td className="py-1.5 pr-2 align-middle text-sm font-bold text-ink">
                    {row.label}
                  </td>
                  <td className="py-1.5 pr-2 align-middle">
                    <Keycaps tokens={row.tokens} />
                  </td>
                  <td className="py-1.5 text-right align-middle">
                    <span data-testid="cost-cost" className="block font-mono text-xs text-ink-2">
                      {t.practice.layers.cost(row.cost)}
                    </span>
                    <span
                      data-testid="cost-rank"
                      data-optimal={row.optimal}
                      className={`mt-0.5 inline-block rounded-full border px-2 py-px text-[11.5px] font-bold ${
                        row.optimal
                          ? "border-amber-hi bg-amber text-amber-ink"
                          : "border-line text-ink-3"
                      }`}
                    >
                      {row.optimal ? t.practice.layers.optimal : t.practice.layers.valid}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {asked === undefined ? (
          <p data-testid="cost-example" className="mt-1.5 text-xs text-ink-3">
            {t.practice.layers.example}
          </p>
        ) : null}
      </section>
    </aside>
  );
}
