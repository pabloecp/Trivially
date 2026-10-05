# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Trivially is a real-time music trivia game ("Adivina la canción"): players hear a 30s audio preview and type the song title, solo or in multiplayer rooms with `XO····` codes. All UI copy and server error messages are in Spanish — keep new strings in Spanish. The project was previously called YOAVLLY; that name still appears in the session cookie and `localStorage` keys (`yoavlly-user`, `yoavlly_guest_id`, `yoavlly_theme`). Don't rename those keys without a migration or existing users lose their saved identity.

## Commands

Plain JavaScript (ESM) throughout. No TypeScript, no linter, no frontend tests.

```bash
npm run install:all            # install backend + frontend deps (root has only `concurrently`)
npm run dev                    # backend on :8080 (node --watch) + Vite on :5173
npm test --prefix backend      # run all backend tests
node backend/src/game/answers.test.js   # run one test file
npm run build --prefix frontend         # production build to frontend/dist
npm run geo:upload --prefix backend     # Geografía's questions (geo/countries.js) to Supabase
```

`.claude/launch.json` defines `trivially-dev` (root `npm run dev`, port 5173) for the preview tools. The preview tools pass `PORT=5173` to the whole command, which makes the API collide with Vite, so start `trivially-api` (port 8080) and `trivially-web` (port 5173) separately instead.

Tests are standalone scripts using `node:assert/strict`. There is no test runner: each file runs top to bottom and prints `"<name> ok"`. A new test file must be appended to the `&&` chain in `backend/package.json` `scripts.test` or it won't run.

**Gotcha:** `saveStore()` always writes to the tracked file `backend/data/store.json`, even when a test passes its own in-memory store object. Running the store tests overwrites that file. Check `git diff backend/data/store.json` afterwards and restore it.

## Architecture

### Server-authoritative game loop (backend)

- `backend/src/game/roomManager.js` holds all game state in memory. Rooms live in a `Map` keyed by code, plus a `socketToRoom` map from socket id to `{code, userId}`. Nothing about rooms is persisted, so a server restart drops every room.
- A room is a party that outlives any one game. `room.game` is `null` while everyone is on the Home screen, or a game id from `GAME_IDS` (`"musica"`, `"opciones"` and `"mundo"`). Only the host can change it, with `setGame()` (socket `room:setGame`), which also abandons any match in progress via `resetMatch()`. `room:create` without a `game` field defaults to `"musica"` for older clients.
- Leaving and dropping out are different. `leave()` (explicit `room:leave`) removes the player right away. `disconnect()` marks them `connected: false` and keeps their seat and host role for `RECONNECT_GRACE_MS` (20s) so a reload doesn't kick them out. `addPlayer()` with the same user id reclaims the seat. When the last connected player goes, the room is destroyed.
- Phases: `lobby → countdown (3s) → playing (config.roundMs, 15s by default) → reveal (3s) →` the next round's countdown, until `finished`. `setPhase()` owns the single `room.timer`, and every transition calls `rooms.onPhaseChange`. `sockets.js` wires that hook to broadcast `room:state`, and `watchRoom()` also re-broadcasts about once a second while a match runs.
- `publicState(room, forUserId)` is the **only** serializer sent to clients, and it is where secrets are withheld. Other players' answers and the current track's metadata are hidden until `reveal`. Only `audio.previewUrl` is exposed during countdown and playing. `searchCatalog` (the autocomplete list) is included only during `playing`. The per-user `me` block is included only when `forUserId` is passed, which happens in ack responses, not broadcasts. Any new room or player field must be added here deliberately.
- `game:answer` accepts either the exact track id (the player picked an autocomplete suggestion) or free text, which is matched with `isCorrectAnswer` in `game/answers.js`. That function normalizes accents and strips parentheticals, then applies Levenshtein and substring tolerance. Scoring is in `game/scoring.js`: 800 base, up to 500 speed bonus, and a streak bonus capped at 400.
- When a match finishes, `applyMatchStats` writes cumulative per-user stats to the store (see Persistence below).
- **Opción múltiple** (`"opciones"`, `QUIZ_GAME`) reuses the same loop. Its settings live in `config.quiz` (`rounds` 5–20, `roundMs` 5–30 s, `difficulty` `facil|media|dificil|mixta`), and `game/quiz.js` has the limits and `pickQuestions`, which draws the match's questions into `room.tracks` (in place of songs) and shuffles each one's options. `game:answer` takes the option index: `submitQuizAnswer` only records it, and only during `playing` (no grace period, since the reveal shows the right option). `gradeQuiz()` scores every answer at once when the reveal starts, so no ack, score or streak tells anyone whether an answer was right before then. `publicQuestion()` never sends the question id, withholds the options until `playing`, and withholds the right one and the per-option `picks` until `reveal`. The reveal lasts `QUIZ_REVEAL_MS` (5s). The frontend lives in `src/modes/quiz/` (route `/quiz/:code`) with styles in `styles/quiz.css`.

### Question bank (Opción múltiple and Geografía)

Both trivia modes read the Supabase table `questions`, loaded once at boot by `src/questions/questionBank.js` and passed to `RoomManager`; each mode filters its own rows by `mode` (`opciones` or `mundo`). Opción múltiple's rows come from a private file; Geografía's are generated from a committed country list (see "Geografía" below).

- **Opción múltiple's real questions must never be committed: the GitHub repo is public.** They live in the Supabase table `questions` and in the git-ignored file `backend/private/questions.json`.
- `questions/questionBank.js` `loadQuestions()` runs at boot and passes the bank to `RoomManager`. It reads the Supabase table (active rows), else the private file, else the obviously fake placeholders in `questions/sampleQuestions.js`. The table has RLS on and no policies, so only the backend's service-role key can read it. Never add a public read policy or an API route that lists questions.
- Row shape (`questions/questionSchema.js`, `backend/supabase/schema.sql`): `id, type, mode, category, difficulty, language, prompt, data, active, created_at`. Played types: `multiple_choice` (`data = { options: [4 texts], correct: index }`), `open` (`data = { answer, aliases, reject }`, plus `flag` on flag questions) and `location` (`data = { name, map }`); `true_false` and `audio` are reserved. `mode` is the game id (`opciones`, `mundo`) or null for any. Categories are the ids in `QUESTION_CATEGORIES` (`ciencia`, `historia`, `literatura`, `musica`, `arte`, `deportes`, `peliculas_series`, `videojuegos`, `geografia`, `cultura`); players see the display names.
- `npm run questions:upload --prefix backend` validates the private file (nothing is uploaded if any row is wrong) and upserts it by id. Rows without an id get a uuid written back into the file. `-- --check` only validates and prints counts per category and difficulty; `-- --prune` also deletes database rows that aren't in the file, except Geografía's (`mode = 'mundo'`), which belong to `geo:upload`.

### Geografía (id `mundo`, `GEO_GAME`)

Three kinds of question, each with fácil/media/difícil: **capitales** and **banderas** (written answer) and **ubicación** (a pin on the world map). Settings live in `config.geo` (`rounds` 5–25, `roundMs` 10–30 s for written answers, `kinds`, `difficulty` `facil|media|dificil|mixta`); `game/geo.js` has the limits, `pickGeoQuestions` (the chosen kinds share the rounds evenly, never two questions about the same country) and the map scoring.

- **Questions:** `geo/countries.js` lists the 194 countries (Spanish name, capital, aliases, difficulty per kind, their name in the map file). `geo/geoQuestions.js` turns it into `questions` rows with stable uuids, and adds to each written question's `reject` every other country's answer the typo tolerance would accept ("Viena"/"Vilna", "Níger"/"Nigeria"). `npm run geo:upload --prefix backend` upserts them to Supabase and deletes `mundo` rows that are gone (`-- --check` only validates). `geoBank()` uses the Supabase rows and fills any kind they lack from `countries.js`, so the mode works before (or without) the upload. The `location` type needs the `questions_type_check` constraint from `schema.sql`.
- **Written rounds** are checked with `isCorrectOpenAnswer` (`game/openAnswers.js`) and scored like songs. A flag is served by `/api/geo/flag/<token>` (`geo/flags.js` downloads it from flagcdn and keeps it in memory): the token is random so the image's address never names the country.
- **Map rounds** always last `LOCATION_ROUND_MS` (10 s). Clients send pins with the socket `game:pin` (`{ lng, lat, lock }`, store action `placePin`): a pin can move until locked, and the last one counts when time runs out. `gradeMap()` judges them at the reveal with `geo/worldMap.js` `locate()` (inside, km to the nearest border, nearest point), using the same `world-atlas` 50m file the frontend draws: inside (with `INSIDE_TOLERANCE_KM`) gets 1000 points, outside fewer the further away.
- **Tiebreak:** after the last round, if two or more connected players share the top score, `beginTiebreak()` adds a map round only they play (`room.tiebreak`, the others get status `mirando`). Pins move until confirmed and a confirmed pin is final: the first one confirmed inside the country ends the round and wins; otherwise the closest pin wins regardless of time. No winner means another tiebreak, up to `MAX_TIEBREAKS` (3). It gives no points; `rankedPlayers()` puts the winner first in the results and the stats (`tiebreakWinner`).
- `publicState` sends only the kind during the countdown, then the prompt (and the country to find, or the flag's token address) while playing; `reveal` has the answer, the flag and the map names of the country, and each player's `lastAnswer` carries their pin, distance and nearest point.
- **Frontend:** `modes/mundo/` (route `/mundo/:code`): `Game.jsx`, `WorldMap.jsx`, `worldData.js` (loads `world-atlas/countries-50m.json` only when needed, Natural Earth projection, `countryAt`, `REGIONS`), `GeoSettings.jsx`, `LobbyPanel.jsx`, `StartButton.jsx`; styles in `styles/geo.css`. A match with map rounds keeps one fixed frame for every round (`.tv-geo-stage`: one column, the scoreboard under it, as tall as the screen under the top bar via `--geo-top`, so nothing is scrolled): the top card always has three lines (kicker, title, hint) and the card under it fills the rest. In a map round that card is the same `WorldMap` from countdown (frozen, number over it) to reveal, with its toolbar above the map and the confirm button / result row below it, never over it. `WorldMap` controls: tap/click places the pin, which can also be dragged; drag pans with a glide; wheel (animated steps), trackpad/finger pinch, double tap/click and the +/− buttons zoom; continent buttons (`REGIONS`) jump there; the widest view fits the whole world in both directions, and a view may overshoot the map's edge a little so a region near it can be centred; the country under the pin (and under the mouse) is highlighted; from 2× zoom, islands and microstates too small to see get a dot, and a tap on a dot out at sea lands on that country; arrows, +/− and Enter work from the keyboard. Reveal flies to the country and the pins.

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

The catalog is a set of playlists of songs with iTunes `previewUrl`s. `catalog/catalogProvider.js` `loadCatalog()` reads it at boot from the Supabase tables `songs`, `playlists` and `playlist_songs` (see `backend/supabase/schema.sql`), and falls back to `catalog/catalog.json` when Supabase isn't configured or has no playlists. `npm run catalog:upload --prefix backend` copies `catalog.json` to Supabase, deleting songs and playlists the file no longer has. There are two playlists of 100 songs taken from kworb.net's all-time Spotify ranking: Spanish (`top-es`, the default for new rooms) and English (`top-en`). Round selection lives in `catalog/songSelector.js`: a match draws from the union of `config.playlistIds`, or from the default playlist when none of those ids exists. If `room.config.customTracks` is set, the catalog is bypassed entirely. `spotifyCatalog.js` exists but is not wired in.

Owners who host a room can add their own Spotify playlists (the "+" chip in `MusicSettings.jsx`, socket `room:spotifyPlaylist`). They go in `config.playlistIds` as `sp:<spotify id>` and live in `room.customPlaylists`. `catalog/spotifyLibrary.js` reads the songs from Spotify, and `catalog/trackResolver.js` finds each one's preview and cover on iTunes through a single rate-limited queue (~19 requests a minute): one search by title and artist, or through each of the song's artists (up to 3): the album with the same name, else the artist's 200 most popular songs (artist, album and song-list lookups are cached, so songs sharing them cost nothing extra). Titles iTunes censors ("F**K") still match. The most recently chosen playlist is searched first, and a second, deeper pass for the songs not found only runs when no first-pass work is waiting. A match can't start with fewer playable songs than rounds. Results, found or not, are cached in memory and in the Supabase table `spotify_songs`. Rounds are picked a couple at a time (`pickAhead`), so a match can start while the playlist is still loading and songs found later join the draw.

### Persistence and auth

- `backend/src/db/store.js` is a JSON-file "DB". It is loaded once at boot and fully rewritten synchronously on every mutation.
- There are three kinds of users:
  - guests: `gst_…` ids generated and kept in the client's `localStorage`
  - email/password accounts: scrypt hashes
  - Google OAuth accounts: `auth/google.js`
- On register, login, or Google sign-in, `claimGuestStats` merges the guest's stats into the account and deletes the guest.
- `cookie-session` stores only `userId`. It is set to `SameSite=None; Secure` when `CLIENT_ORIGIN` is https or in production.
- Use `sanitizeUser` for the account owner and `sanitizeUserPublic` for everyone else.
- Owners can link a Spotify account (`auth/spotify.js`, `/api/spotify/login` → `/auth/spotify/callback`). The tokens stay in `user.spotify` on the server; `sanitizeUser` only exposes the id and display name, and `sanitizeUserPublic` only `spotifyLinked`.
- `supabaseEnabled()` is always false inside `*.test.js` scripts, so tests never write to the real Supabase `users` table even when its variables are set.

### Frontend structure (mid-redesign)

- `/` (`pages/Home.jsx`) uses the new casual-game design. Its styles are in `styles/home.css`, where every class is namespaced `tv-` and uses `--tv-*` tokens.
- Home is the multiplayer hub. The Jugar sheet (`components/home/PlaySheet.jsx`) creates or joins a room, asking for a guest name first when there isn't one. `components/home/PartyPanel.jsx` shows the code, the players (tapping one opens their profile and, for the host, the settings permission) and the invite link `/sala/:code`, which also renders Home and auto-joins. A room's own address is `/sala/:code`: creating or joining one moves Home there, and leaving (the red button, or Inicio tapped twice) goes back to `/`. The room screen (Home with a room) never changes page while the room waits: the host taps a mode tile and every player's screen swaps in that mode's `Lobby` panel (settings, start button) with an animation. Only starting a match moves players to the game screen.
- The mode tiles come from the registry in `src/modes/index.js` (`GAME_MODES`). To add a mode:
  - add an entry there with `available: true`, a `Lobby` panel component and a `path(room)` for its in-match screens
  - add the id to `GAME_IDS` in `roomManager.js`
- `RoomNavigator` in `App.jsx` does all room-driven navigation. It sends each client to `roomPath(room)` (`/sala/:code` while the room is in `lobby`, the mode's `path` during a match) and swaps out stale `/game` or `/sala` screens of the player's own room. It pulls players off other pages (profile, leaderboard) only when a match starts. Old `/lobby/:code` links redirect to `/sala/:code`. Game pages should not navigate on phase changes themselves.
- All other routes, including the music mode's pages in `src/modes/music/` (Setup → Lobby → Game), render inside `LegacyShell` in `App.jsx`. That shell adds the old navbar `Layout` and uses the older design tokens in `styles/global.css`.
- `lib/theme.js` `useTheme()` sets `data-theme` on `<html>`. Both stylesheets define `[data-theme="light"]` overrides.

### Environments and deployment

- **Local dev:** leave `VITE_API_URL` unset. `BACKEND_URL` is then `""`, and Vite proxies `/api` and `/socket.io` to `127.0.0.1:8080`. If `VITE_API_URL` is set to the Railway URL, local dev talks to production.
  - The `/auth` proxy entry has a `bypass` that returns `false`, which makes Vite answer 404 for every `/auth/*` request. As a result, the Google OAuth redirect and callback don't work through `:5173` as currently configured.
- **Production:**
  - The frontend is on Vercel. `frontend/vercel.json` rewrites `/api` and `/auth` to the Railway backend and sends everything else to the SPA. Socket.IO connects directly to `BACKEND_URL`.
  - The backend is on Railway, port 8080. It also serves `frontend/dist` as a static SPA fallback when that folder exists.
- The backend loads `.env` from `backend/` and from the repo root. Variables: `PORT`, `CLIENT_ORIGIN`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` (optional, defaults to `<CLIENT_ORIGIN>/auth/spotify/callback`).

