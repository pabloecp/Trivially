# Avisos cuando algo falla

Two free services, set up outside the code. Neither sees players' personal data.

## UptimeRobot: the server is down

- An account at uptimerobot.com, and an **HTTP(s)** monitor on `https://trivially-production.up.railway.app/health` every 5 minutes. `/health` answers `{ ok: true }` as soon as the server is up (`backend/src/index.js`).
- Alerts by email (or Telegram, Discord…) when it stops answering, and when it comes back.
- Optional: a second monitor on the site (`https://triviallyonline.vercel.app/`), to know if Vercel fails.

## Sentry: errors of the server and of the page

- Off until its keys are set: without them nothing is loaded or sent.
- **Server:** `backend/src/instrument.js`, imported first by `index.js`. `SENTRY_DSN` in Railway's variables (optional `SENTRY_ENVIRONMENT`). It catches failures nobody handled (an exception, a promise without `catch`, a route that throws: `Sentry.setupExpressErrorHandler`). The errors a socket handler turns into a message for the player (`ack({ error })`) are expected, not sent.
- **Page:** `frontend/src/lib/monitoring.js`, started in `main.jsx`. `VITE_SENTRY_DSN` in Vercel's variables (it goes into the build: redeploy after setting it). `@sentry/react` downloads apart, after the page starts. `reportError(error)` sends an error the page caught itself: the "Algo salió mal" screen (`ErrorBoundary`) should call it in `componentDidCatch`.
- Both with `sendDefaultPii: false` (no IPs, cookies or bodies) and no performance tracing. A project of each kind in sentry.io (Node and React); the free plan is enough.
