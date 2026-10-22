import { Component, type ReactNode } from "react";
import { en } from "../i18n/en";
import type { Messages } from "../i18n/messages";
import type { ErrorReporter } from "./errorReporter";

interface ErrorBoundaryProps {
  readonly reporter: ErrorReporter;
  /**
   * Text of the fallback screen. This component sits above the providers, so it cannot read the
   * language from context: whoever mounts it passes the slice for the stored language.
   */
  readonly messages?: Messages["app"];
  readonly children: ReactNode;
}

/**
 * The last line of defense: without it a rendering error blanks the page. The fallback says what
 * happened in plain words, points out that progress is saved (every attempt is written to storage
 * before it is shown), and offers a way out that works without the app having to be healthy.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    this.props.reporter.report(error, "react");
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const t = (this.props.messages ?? en.app).errorBoundary;
    return (
      <main
        role="alert"
        className="flex min-h-screen items-center justify-center bg-canvas p-8 text-ink"
      >
        <div className="max-w-md space-y-4">
          <h1 className="text-[32px] font-bold">{t.title}</h1>
          <p className="text-ink-2">{t.body}</p>
          <div className="flex gap-3">
            <button
              type="button"
              autoFocus
              onClick={() => window.location.reload()}
              className="inline-flex min-h-12 items-center rounded-xl bg-amber px-5 text-base font-bold text-amber-ink hover:bg-amber-hi"
            >
              {t.reload}
            </button>
            <a
              href="#/"
              onClick={() => window.setTimeout(() => window.location.reload(), 0)}
              className="inline-flex min-h-12 items-center rounded-xl border border-line-strong px-5 text-base font-semibold text-ink no-underline hover:bg-raised"
            >
              {t.backToToday}
            </a>
          </div>
        </div>
      </main>
    );
  }
}
