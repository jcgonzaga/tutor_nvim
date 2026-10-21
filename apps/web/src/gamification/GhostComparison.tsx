import type { RunSummary } from "@tutor-nvim/evaluation";

const formatMs = (ms: number | null): string => (ms === null ? "-" : `${(ms / 1000).toFixed(1)} s`);

/** The learner's run next to the master's (T-805): `YOU hhhhwwci"` / `MASTER 2wci"`. */
export function GhostComparison({ rows }: { readonly rows: readonly RunSummary[] }) {
  return (
    <table data-testid="ghost" className="w-full border-collapse text-left font-mono text-sm">
      <caption className="pb-1 text-left font-sans text-[15px] font-bold tracking-[0.06em] text-ink-3">
        Compare
      </caption>
      <thead className="sr-only">
        <tr>
          <th>Run</th>
          <th>Keys</th>
          <th>Keystrokes</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} data-testid={`ghost-${row.label.toLowerCase().replace(" ", "-")}`}>
            <th scope="row" className="w-28 pr-3 font-semibold text-ink-2">
              {row.label}
            </th>
            <td className="pr-3 break-all">{row.keys || "(nothing)"}</td>
            <td className="pr-3 text-right text-ink-3">{row.keystrokes}</td>
            <td className="text-right text-ink-3">{formatMs(row.durationMs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
