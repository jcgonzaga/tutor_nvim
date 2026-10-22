import { Kbd, type KbdState } from "./Kbd";

/** A key sequence as keycaps: `ci"<Esc>` becomes c, i, ", Esc. Display only. */
export function KeyCaps({
  keys,
  state = "plain",
  size = "sm",
}: {
  readonly keys: string;
  readonly state?: KbdState;
  readonly size?: "xs" | "sm" | "md";
}) {
  const tokens = keys.match(/<[^>]+>|./g) ?? [];
  return (
    <span className="flex flex-wrap gap-1.5">
      {tokens.map((token, index) => (
        <Kbd key={index} size={size} state={state}>
          {token.startsWith("<") ? token.slice(1, -1) : token === " " ? "␣" : token}
        </Kbd>
      ))}
    </span>
  );
}
