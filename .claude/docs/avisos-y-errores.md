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

## When something fails in the server

- **A match that fails is closed alone.** What a room's timer does when a phase ends runs inside `RoomManager.guard`: if it throws, that room is closed (`closeBroken`), its players go back to Inicio with "La partida se cerró por un error nuestro…" (`room:kicked`, reason `error`) and the error goes to Sentry (`rooms.onError`, `index.js`). The other matches go on.
- **The last net:** once the server is listening, `index.js` handles `uncaughtException` and `unhandledRejection`: written in the log, sent to Sentry, and the server goes on (without it, one such error stopped the server and every open match was lost). Errors while starting still stop it.

## Accounts: limits and sessions

- **Limits by player, not by Vercel** (`auth/rateLimit.js`): the site's requests arrive through Vercel, so the address the server sees is Vercel's. `clientAddress` reads the player's own from `x-vercel-forwarded-for` (else `x-forwarded-for`): 10 tries a minute of entering, registering or recovering, 60 username checks. A second, higher limit by the address the server really sees (300 and 1500) stops someone who talks to Railway directly writing a new address each time.
- **Wrong passwords for one account:** 10 in 10 minutes, from anywhere, and that account waits (`loginLocked`).
- **Passwords:** 2 characters at least (`MIN_PASSWORD_LENGTH`, `db/store.js`).
- **A login that fails says one thing** (`LOGIN_FAILED`), whether the account doesn't exist, the password is wrong or the account only enters with Google, and takes as long in all of them: the form doesn't tell whose email has an account. Registering still says when an email is taken.
- **Deleting an account** (`DELETE /api/auth/delete-account`) asks for its name and, when it has one, its password. On the profile, "Borrar cuenta" (a text button beside the legal links, accounts only) opens its panel (`DeleteAccount` in `Profile.jsx`, a `Modal`): what is lost, the name to type, the password when there is one, "Cancelar" grey and "Borrar cuenta" red, off until both are written.
- **Signing out everywhere** (`endSessions`, `sessionStillValid`): a new password sets `sessionsAfter` on the account, and every cookie, session token and socket token made before it stops counting (each one says when it was made: `session.at`, `iat`). `sessionsAfter` has no column of its own: it's saved in `extra`.
- **An email nobody proved:** an account made with an email and a password, entered with Google for the first time, loses the password (and its open sessions): Google proved whose email it is, the registration never did. From then on it's entered with Google.
- **The session cookie is `SameSite=Lax`:** the site talks to the server through its own address, so another page can't act with a player's session.
- **Guests** live only in memory: those nobody has seen for two days, and who aren't in a match or a group, are let go every hour (`sweepGuests`).
- **Messages by socket:** at most `EVENTS_PER_SECOND` (40) from one connection; the rest are refused until the second ends, and a connection sending ten times that is cut off (`floodGuard`, `realtime/sockets.js`).
