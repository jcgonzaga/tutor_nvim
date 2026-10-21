import type { ReactNode } from "react";

interface PageProps {
  readonly title: string;
  readonly eyebrow?: string;
  readonly children: ReactNode;
  /** Wider layout for the skill map. */
  readonly wide?: boolean;
}

/** Plain page frame for the non-practice screens (practice keeps its own low-distraction layout). */
export function Page({ title, eyebrow, children, wide = false }: PageProps) {
  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className={`mx-auto space-y-6 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
        <header>
          {eyebrow ? (
            <p className="text-xs uppercase tracking-widest text-zinc-400">{eyebrow}</p>
          ) : null}
          <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        </header>
        {children}
      </div>
    </main>
  );
}
