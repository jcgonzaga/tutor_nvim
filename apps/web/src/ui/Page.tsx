import type { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { eyebrowClass } from "./styles";

interface PageProps {
  readonly title: string;
  readonly eyebrow?: string;
  /** A sentence under the title. */
  readonly lead?: ReactNode;
  readonly children: ReactNode;
  /** Wider layout for the skill map. */
  readonly wide?: boolean;
  /** Without the navigation header (screens that run before onboarding is done). */
  readonly bare?: boolean;
}

/** Page frame for the non-practice screens (practice keeps its own low-distraction layout). */
export function Page({ title, eyebrow, lead, children, wide = false, bare = false }: PageProps) {
  const width = wide ? "max-w-[1360px]" : "max-w-[1200px]";
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {bare ? null : <AppHeader width={width} />}
      <main className={`mx-auto flex flex-col gap-8 px-8 pb-16 pt-12 ${width}`}>
        <div className="flex flex-col gap-2">
          {eyebrow ? <p className={eyebrowClass}>{eyebrow}</p> : null}
          <h1 className="text-balance text-[40px] font-bold leading-[1.15] tracking-[-0.02em]">
            {title}
          </h1>
          {lead ? <p className="text-lg text-ink-2">{lead}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
