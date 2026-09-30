# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Trivially is a real-time music trivia game ("Adivina la canción"): players hear a 30s audio preview and type the song title, solo or in multiplayer rooms with `XO····` codes. All UI copy and server error messages are in Spanish — keep new strings in Spanish. The project was previously called YOAVLLY; that name still appears in package names, the session cookie, and `localStorage` keys (`yoavlly-user`, `yoavlly_guest_id`, `yoavlly_theme`). Don't rename those keys without a migration or existing users lose their saved identity.

## Commands

Plain JavaScript (ESM) throughout. No TypeScript, no linter, no frontend tests.

```bash
npm run install:all            # install backend + frontend deps (root has only `concurrently`)
npm run dev                    # backend on :8080 (node --watch) + Vite on :5173
npm test --prefix backend      # run all backend tests
node backend/src/game/answers.test.js   # run one test file
npm run build --prefix frontend         # production build to frontend/dist
```

`.claude/launch.json` defines `trivially-dev` (root `npm run dev`, port 5173) for the preview tools.

Tests are standalone scripts using `node:assert/strict`. There is no test runner: each file runs top to bottom and prints `"<name> ok"`. A new test file must be appended to the `&&` chain in `backend/package.json` `scripts.test` or it won't run.

**Gotcha:** `saveStore()` always writes to the tracked file `backend/data/store.json`, even when a test passes its own in-memory store object. Running the store tests overwrites that file. Check `git diff backend/data/store.json` afterwards and restore it.

## Architecture

### Server-authoritative game loop (backend)

- `backend/src/game/roomManager.js` holds all game state in memory. Rooms live in a `Map` keyed by code, plus a `socketToRoom` map from socket id to `{code, userId}`. Nothing about rooms is persisted, so a server restart drops every room.
- A room is a party that outlives any one game. `room.game` is `null` while everyone is on the Home screen, or a game id from `GAME_IDS` (currently only `"musica"`). Only the host can change it, with `setGame()` (socket `room:setGame`), which also abandons any match in progress via `resetMatch()`. `room:create` without a `game` field defaults to `"musica"` for older clients.
- Leaving and dropping out are different. `leave()` (explicit `room:leave`) removes the player right away. `disconnect()` marks them `connected: false` and keeps their seat and host role for `RECONNECT_GRACE_MS` (20s) so a reload doesn't kick them out. `addPlayer()` with the same user id reclaims the seat. When the last connected player goes, the room is destroyed.
- Phases: `lobby → countdown (3s) → playing (config.roundMs, 15s by default) → reveal (7s) →` the next round's countdown, until `finished`. `setPhase()` owns the single `room.timer`, and every transition calls `rooms.onPhaseChange`. `sockets.js` wires that hook to broadcast `room:state`, and `watchRoom()` also re-broadcasts about once a second while a match runs.
- `publicState(room, forUserId)` is the **only** serializer sent to clients, and it is where secrets are withheld. Other players' answers and the current track's metadata are hidden until `reveal`. Only `audio.previewUrl` is exposed during countdown and playing. `searchCatalog` (the autocomplete list) is included only during `playing`. The per-user `me` block is included only when `forUserId` is passed, which happens in ack responses, not broadcasts. Any new room or player field must be added here deliberately.
- `game:answer` accepts either the exact track id (the player picked an autocomplete suggestion) or free text, which is matched with `isCorrectAnswer` in `game/answers.js`. That function normalizes accents and strips parentheticals, then applies Levenshtein and substring tolerance. Scoring is in `game/scoring.js`: 800 base, up to 500 speed bonus, and a streak bonus capped at 400.
- When a match finishes, `applyMatchStats` writes cumulative per-user stats to the store (see Persistence below).

### Socket protocol

Every client→server event in `backend/src/realtime/sockets.js` follows the same pattern:

1. `requireRoom(rooms, socket)`
2. call a `RoomManager` method (it throws `Error` with a Spanish message on failure)
3. `ack({ ok, error?, state? })`
4. `io.to(room.code).emit("room:state", …)`

On the client, `frontend/src/lib/store.jsx` (`AppProvider` / `useApp()`) wraps each event as an action via `emitAck` from `lib/socket.js`. It subscribes to `room:state` and keeps the latest snapshot in `room`. Adding a feature usually means changing all three places: a RoomManager method, a socket handler, and a store action.

Socket identity comes from the `user` object the client sends in `room:create` and `room:join` (its id and name). It is not checked against the cookie session. A socket is in at most one room: creating or joining a room first leaves the previous one through `leaveCurrentRoom()`, which also takes the socket out of the old room's broadcast channel.

The store saves the current room code in `sessionStorage` (`trivially_room`). On page load and on every socket reconnect it re-sends `room:join`, and it ignores `room:state` for any room it has left. Store actions read the user from `userRef`, not from the `user` state, so `saveGuest()` followed by `joinRoom()` in the same handler works.

Timers on the client use `remainingMs(room)`, which corrects for clock skew with `serverNow`. The game screen seeks the audio by `phaseStartedAt` so all players hear the same moment.

### Catalog

`catalog/catalogProvider.js` `loadCatalog()` returns the static `seedCatalog.js`, which holds artists, albums, genres, playlists, and songs with iTunes `previewUrl`s. `spotifyCatalog.js` exists but is not wired in. Round selection lives in `catalog/songSelector.js`: `config.enabledCategories` decides which id filters (`artistIds`, `genreIds`, `albumIds`, `playlistIds`, `yearFrom`/`yearTo`) apply. If `room.config.customTracks` is set, the catalog is bypassed entirely.

### Persistence and auth

- `backend/src/db/store.js` is a JSON-file "DB". It is loaded once at boot and fully rewritten synchronously on every mutation.
- There are three kinds of users:
  - guests: `gst_…` ids generated and kept in the client's `localStorage`
  - email/password accounts: scrypt hashes
  - Google OAuth accounts: `auth/google.js`
- On register, login, or Google sign-in, `claimGuestStats` merges the guest's stats into the account and deletes the guest.
- `cookie-session` stores only `userId`. It is set to `SameSite=None; Secure` when `CLIENT_ORIGIN` is https or in production.
- Use `sanitizeUser` for the account owner and `sanitizeUserPublic` for everyone else.

### Frontend structure (mid-redesign)

- `/` (`pages/Home.jsx`) uses the new casual-game design. Its styles are in `styles/home.css`, where every class is namespaced `tv-` and uses `--tv-*` tokens.
- Home is the multiplayer hub. The Jugar sheet (`components/home/PlaySheet.jsx`) creates or joins a room, asking for a guest name first when there isn't one. `components/home/PartyPanel.jsx` shows the code, the players and the invite link `/sala/:code`, which also renders Home and auto-joins. The room screen (Home with a room) never changes page while the room waits: the host taps a mode tile and every player's screen swaps in that mode's `Lobby` panel (settings, start button) with an animation. Only starting a match moves players to the game screen.
- The mode tiles come from the registry in `src/modes/index.js` (`GAME_MODES`). To add a mode:
  - add an entry there with `available: true`, a `Lobby` panel component and a `path(room)` for its in-match screens
  - add the id to `GAME_IDS` in `roomManager.js`
- `RoomNavigator` in `App.jsx` does all room-driven navigation. It sends each client to `roomPath(room)` (`/` while the room is in `lobby`, the mode's `path` during a match) and swaps out stale `/game` or `/sala` screens of the player's own room. It pulls players off other pages (profile, leaderboard) only when a match starts. Old `/lobby/:code` links redirect to `/sala/:code`. Game pages should not navigate on phase changes themselves.
- All other routes, including the music mode's pages in `src/modes/music/` (Setup → Lobby → Game), render inside `LegacyShell` in `App.jsx`. That shell adds the old navbar `Layout` and uses the older design tokens in `styles/global.css`.
- `lib/theme.js` `useTheme()` sets `data-theme` on `<html>`. Both stylesheets define `[data-theme="light"]` overrides.

### Environments and deployment

- **Local dev:** leave `VITE_API_URL` unset. `BACKEND_URL` is then `""`, and Vite proxies `/api` and `/socket.io` to `127.0.0.1:8080`. If `VITE_API_URL` is set to the Railway URL, local dev talks to production.
  - The `/auth` proxy entry has a `bypass` that returns `false`, which makes Vite answer 404 for every `/auth/*` request. As a result, the Google OAuth redirect and callback don't work through `:5173` as currently configured.
- **Production:**
  - The frontend is on Vercel. `frontend/vercel.json` rewrites `/api` and `/auth` to the Railway backend and sends everything else to the SPA. Socket.IO connects directly to `BACKEND_URL`.
  - The backend is on Railway, port 8080. It also serves `frontend/dist` as a static SPA fallback when that folder exists.
- The backend loads `.env` from `backend/` and from the repo root. Variables: `PORT`, `CLIENT_ORIGIN`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

