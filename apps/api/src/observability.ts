import { z } from "zod";

/** What is known about a request when something goes wrong. No tokens, no e-mail, no body. */
export interface ErrorContext {
  readonly requestId: string;
  readonly method: string;
  readonly route: string;
  /** The internal user id, never the e-mail or the auth provider's id. */
  readonly userId: string | null;
}

/**
 * Backend error observability (T-906). The API reports unexpected failures through this port; the
 * default writes a structured log line, which any log platform can alert on, and a vendor SDK
 * (Sentry and the like) can be plugged in by implementing it. Provider choice is an implementation
 * detail.
 */
export interface ErrorReporter {
  report(error: unknown, context: ErrorContext): void;
}

/** Logger options for production: JSON lines with credentials removed. */
export function productionLoggerOptions(level = "info") {
  return {
    level,
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
      censor: "[redacted]",
    },
  };
}

/**
 * An error the browser caught, as it arrives. The web app strips everything private before
 * sending (profile data, keys typed, buffers), and the API truncates again: it never trusts the
 * sender, and the endpoint is anonymous.
 */
export const clientErrorSchema = z.object({
  message: z.string().min(1).max(1000),
  stack: z.string().max(6000).optional(),
  /** The screen, e.g. `session`, never a slug or an id. */
  route: z.string().max(60).optional(),
  build: z.string().max(60).optional(),
  kind: z.enum(["error", "unhandledrejection", "react"]).default("error"),
});
export type ClientError = z.output<typeof clientErrorSchema>;
