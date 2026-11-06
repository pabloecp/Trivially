// The page's errors sent to Sentry (sentry.io), only when the site is built with VITE_SENTRY_DSN (in Vercel): without
// it nothing is loaded or sent. Sentry's code is downloaded apart, after the page starts, so it never slows it down.
// No personal data (sendDefaultPii off) and no performance tracing: only errors.

const dsn = import.meta.env.VITE_SENTRY_DSN;
let sentry = null;
// Errors from before Sentry finished loading, sent once it's there.
const early = [];

export function startMonitoring() {
  if (!dsn) return;
  import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        sendDefaultPii: false,
        tracesSampleRate: 0,
      });
      sentry = Sentry;
      for (const err of early.splice(0)) Sentry.captureException(err);
    })
    .catch(() => {});
}

/** Sends an error the page caught itself (a screen that failed to draw, for example). */
export function reportError(error) {
  if (!dsn) return;
  if (sentry) sentry.captureException(error);
  else if (early.length < 10) early.push(error);
}
