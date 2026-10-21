import type { AnalyticsEnvelope, AnalyticsEvent } from "./events";

export interface Analytics {
  track(event: AnalyticsEvent): void;
  /** Sends whatever is waiting. Safe to call at any time, for example when the page is hidden. */
  flush(): void;
}

export interface AnalyticsOptions {
  /** Where batches go; the caller decides how (fetch, beacon). */
  readonly send: (envelope: AnalyticsEnvelope) => void;
  /** Consent is asked on every event, so turning it off takes effect immediately. */
  readonly enabled: () => boolean;
  readonly installId: () => string | null;
  readonly build?: string;
  readonly now?: () => number;
  readonly batchSize?: number;
}

/**
 * Event collection (T-903): consent-gated, buffered, and provider-neutral. Without consent (the
 * default) `track` drops the event on the spot and nothing is ever stored or sent. Events carry no
 * user data (see `events.ts`) and are keyed by a random per-browser id that exists only while the
 * learner allows analytics.
 */
export function createAnalytics(options: AnalyticsOptions): Analytics {
  const now = options.now ?? (() => Date.now());
  const batchSize = options.batchSize ?? 20;
  let buffer: AnalyticsEnvelope["events"][number][] = [];

  const flush = () => {
    const installId = options.installId();
    const events = buffer;
    buffer = [];
    if (events.length === 0 || !options.enabled() || installId === null) return;
    try {
      options.send({
        installId,
        events,
        ...(options.build ? { build: options.build } : {}),
      });
    } catch {
      // Analytics must never be the thing that breaks practice.
    }
  };

  return {
    track(event) {
      if (!options.enabled() || options.installId() === null) return;
      buffer.push({ name: event.name, at: now(), props: event.props });
      if (buffer.length >= batchSize) flush();
    },
    flush,
  };
}

/** Delivery over HTTP; `keepalive` lets the last batch leave while the page is closing. */
export function httpAnalyticsSender(url: string, fetchImpl: typeof fetch = fetch) {
  return (envelope: AnalyticsEnvelope) => {
    void fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
      keepalive: true,
    }).catch(() => undefined);
  };
}
