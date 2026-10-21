/** An error as it leaves the browser: only what is needed to find the bug, nothing private. */
export interface ErrorReport {
  readonly message: string;
  readonly stack?: string;
  /** The screen (`session`, `map`...), never a slug or an id. */
  readonly route?: string;
  readonly build?: string;
  readonly kind: "error" | "unhandledrejection" | "react";
}

export interface ErrorReporter {
  report(error: unknown, kind: ErrorReport["kind"]): void;
}

export const MAX_MESSAGE = 1000;
export const MAX_STACK = 6000;

/**
 * Removes what must never leave the device from an error text: e-mail addresses, bearer/JWT
 * tokens, long opaque ids and URL query strings. Errors are written by code, but they quote
 * data (a failed `JSON.parse` quotes its input), so this is applied to every message and stack.
 */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(/\bBearer\s+[\w.~+/=-]+/gi, "Bearer [token]")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[id]")
    .replace(/\btest:[^\s'"]+/g, "[token]")
    .replace(/(https?:\/\/[^\s?#'")]+)\?[^\s#'")]*/g, "$1?[query]");
}

export function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { message: String(error) };
  }
}

export interface ReporterOptions {
  /** Delivers a report; failures are the sender's business and must not throw. */
  readonly send: (report: ErrorReport) => void;
  readonly build?: string;
  readonly route?: () => string | undefined;
  readonly now?: () => number;
  /** The same error is not sent again within this window. */
  readonly dedupeMs?: number;
  /** A page that keeps failing sends at most this many reports. */
  readonly maxReports?: number;
}

/**
 * Frontend error reporting (T-906). It reports; it never changes what the learner sees and never
 * throws, because the reporter runs while something else is already broken. Identical errors are
 * collapsed and a runaway loop is capped, so a bug cannot flood the endpoint.
 */
export function createErrorReporter(options: ReporterOptions): ErrorReporter {
  const now = options.now ?? (() => Date.now());
  const dedupeMs = options.dedupeMs ?? 60_000;
  const maxReports = options.maxReports ?? 10;
  const lastSent = new Map<string, number>();
  let sent = 0;

  return {
    report(error, kind) {
      try {
        if (sent >= maxReports) return;
        const described = describeError(error);
        const message = scrub(described.message).slice(0, MAX_MESSAGE);
        const stack = described.stack ? scrub(described.stack).slice(0, MAX_STACK) : undefined;
        const firstFrame = stack?.split("\n")[1]?.trim() ?? "";
        const key = `${kind}|${message}|${firstFrame}`;
        const at = now();
        const previous = lastSent.get(key);
        if (previous !== undefined && at - previous < dedupeMs) return;
        lastSent.set(key, at);
        sent += 1;

        const route = options.route?.();
        options.send({
          message,
          kind,
          ...(stack ? { stack } : {}),
          ...(route ? { route } : {}),
          ...(options.build ? { build: options.build } : {}),
        });
      } catch {
        // Reporting must never be the thing that breaks.
      }
    },
  };
}

/** Listens for errors nothing else caught. Returns the function that stops listening. */
export function installGlobalErrorHandlers(
  reporter: ErrorReporter,
  target: Pick<Window, "addEventListener" | "removeEventListener"> = window,
): () => void {
  const onError = (event: ErrorEvent) => reporter.report(event.error ?? event.message, "error");
  const onRejection = (event: PromiseRejectionEvent) =>
    reporter.report(event.reason, "unhandledrejection");
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}

/** Sends a report to the API's `POST /api/client-errors`, without waiting and without throwing. */
export function httpSender(url: string, fetchImpl: typeof fetch = fetch): ReporterOptions["send"] {
  return (report) => {
    void fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => undefined);
  };
}
