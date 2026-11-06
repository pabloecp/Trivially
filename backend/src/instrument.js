import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import * as Sentry from "@sentry/node";

// Runs before index.js reads its .env (imports go first), so it reads it itself.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env") });

// Errors of the server sent to Sentry (sentry.io), only when SENTRY_DSN is set (in Railway): without it nothing is
// sent and nothing changes. Imported first by index.js, so it sees every failure from the start. No personal data:
// no IPs, cookies or request bodies (sendDefaultPii off), and no performance tracing (only errors).
export const sentryOn = Boolean(process.env.SENTRY_DSN);

if (sentryOn) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || (process.env.RAILWAY_ENVIRONMENT_NAME ? "production" : "development"),
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

export { Sentry };
