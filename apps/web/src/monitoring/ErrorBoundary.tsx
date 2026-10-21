import { Component, type ReactNode } from "react";
import type { ErrorReporter } from "./errorReporter";

interface ErrorBoundaryProps {
  readonly reporter: ErrorReporter;
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
    return (
      <main
        role="alert"
        className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100"
      >
        <div className="max-w-md space-y-4">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-zinc-300">
            The app hit an unexpected problem. Your progress is saved on this device, and the error
            has been reported without any of your data.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              autoFocus
              onClick={() => window.location.reload()}
              className="rounded bg-sky-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-sky-400 focus:outline-2 focus:outline-offset-2 focus:outline-sky-400"
            >
              Reload
            </button>
            <a
              href="#/"
              onClick={() => window.setTimeout(() => window.location.reload(), 0)}
              className="rounded border border-zinc-500 px-4 py-2 text-sm hover:bg-zinc-800 focus:outline-2 focus:outline-offset-2 focus:outline-sky-400"
            >
              Back to today
            </a>
          </div>
        </div>
      </main>
    );
  }
}
