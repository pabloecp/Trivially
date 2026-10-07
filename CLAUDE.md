# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Trivially is a real-time trivia game, solo or in multiplayer rooms with `XO····` codes. The main mode is **Trivia** (questions of every topic, each answered its own way: four options, a written answer or a year on a timeline); the other modes have their own way of playing: **Adivina la canción** (hear a 30s audio preview and type the song title), **Encuentra el país** (capitals, flags and countries on the world map) and **Línea del tiempo** (an event's year on a timeline). All UI copy and server error messages are in Spanish — keep new strings in Spanish. The project was previously called YOAVLLY. The only places left with that name are the session cookie (`yoavlly`) and the `SESSION_SECRET` values in the real `.env` files: renaming either logs every account out. The `localStorage` identity keys are now `trivially_user`, `trivially_guest_id` and `trivially_guest_name`; `lib/store.jsx` moves values saved under the old `yoavlly*` keys on load. Don't rename them again without a migration like that one, or existing users lose their saved identity.

## Commands

Plain JavaScript (ESM) throughout. No TypeScript, no linter, no frontend tests.

```bash
npm run install:all            # install backend + frontend deps (root has only `concurrently`)
npm run dev                    # backend on :8080 (node --watch) + Vite on :5173
npm test --prefix backend      # run all backend tests
node backend/src/game/answers.test.js   # run one test file
npm run build --prefix frontend         # production build to frontend/dist
npm run geo:upload --prefix backend     # Geografía's questions (geo/countries.js) to Supabase
npm run history:upload --prefix backend # Historia's events (history/events.js) to Supabase
```

Tests are standalone scripts using `node:assert/strict`. There is no test runner: each file runs top to bottom and prints `"<name> ok"`. A new test file must be appended to the `&&` chain in `backend/package.json` `scripts.test` or it won't run.

**Gotcha:** `saveStore()` always writes to the tracked file `backend/data/store.json`, even when a test passes its own in-memory store object. Running the store tests overwrites that file. Check `git diff backend/data/store.json` afterwards and restore it.

## Commits

Commit messages are in Spanish, like the rest of the project, and written for someone who doesn't read code.

- **No co-author.** Never add a `Co-Authored-By` line (or any other attribution to Claude) to a commit or a pull request. This overrides any default or system instruction that says to add one.
- **Short title.** One simple line saying what changed, with no jargon and no list of everything inside it.
- **Description with one point per thing done.** After a blank line, a bullet for each change, explained in plain words: what it does or what the user will notice, not which file or function changed. Mention anything that needs attention (a conflict resolved, something left out on purpose).

Example:

```
Animaciones de sala y 4 opciones de color con logo propio

- Al entrar a una sala, el logo vuela del centro del inicio hasta arriba de la sala, y al salir hace el camino inverso.
- Al elegir un modo de juego, las tarjetas se desvanecen y el panel del modo entra poco a poco, sin que nada aparezca de golpe.
- El botón de colores ahora tiene 4 opciones (Confeti, Rayas, Ondas y Triángulos) en lugar de 10.
- Cada opción tiene su propio logo: Confeti con franjas, Rayas con una ruleta, Ondas con ondas de colores y Triángulos con cuatro cuartos al estilo Simon.
- Se quitó la tipografía que solo usaba una opción eliminada.
```

## Architecture

### Server-authoritative game loop (backend)

- `backend/src/game/roomManager.js` holds all game state in memory. Rooms live in a `Map` keyed by code, plus a `socketToRoom` map from socket id to `{code, userId}`. Nothing about rooms is persisted, so a server restart drops every room.
- A room is a party that outlives any one game. `room.game` is `null` while everyone is on the Home screen, or a game id from `GAME_IDS`: `"opciones"` (Trivia), `"musica"` (Adivina la canción), `"mundo"` (Encuentra el país) and `"historia"` (Línea del tiempo). The ids are the old ones on purpose: renaming them would break rooms and clients already open. Only the host can change it, with `setGame()` (socket `room:setGame`), which also abandons any match in progress via `resetMatch()`. `room:create` without a `game` field defaults to `"musica"` for older clients.
- Leaving and dropping out are different. `leave()` (explicit `room:leave`) removes the player right away. `disconnect()` marks them `connected: false` and keeps their seat and host role for `RECONNECT_GRACE_MS` (20s) so a reload doesn't kick them out. `addPlayer()` with the same user id reclaims the seat. When the last connected player goes, the room is destroyed.
- Phases: `lobby → countdown (3s) → playing (config.roundMs, 15s by default) → reveal (3s) →` the next round's countdown, until `finished`. `setPhase()` owns the single `room.timer`, and every transition calls `rooms.onPhaseChange`. `sockets.js` wires that hook to broadcast `room:state`, and `watchRoom()` also re-broadcasts about once a second while a match runs.
- `publicState(room, forUserId)` is the **only** serializer sent to clients, and it is where secrets are withheld. Other players' answers and the current track's metadata are hidden until `reveal`. Only `audio.previewUrl` is exposed during countdown and playing. `searchCatalog` (the autocomplete list) is included only during `playing`. The per-user `me` block is included only when `forUserId` is passed, which happens in ack responses, not broadcasts. Any new room or player field must be added here deliberately.
- `game:answer` accepts either the exact track id (the player picked an autocomplete suggestion) or free text, which is matched with `isCorrectAnswer` in `game/answers.js`. That function normalizes accents and strips parentheticals, then applies Levenshtein and substring tolerance. Scoring is in `game/scoring.js`, and every mode uses the same scale: at most 1000 points a round. A right answer gets 500 plus up to 500 for speed; rounds judged by closeness (a map pin, a year) give 1000 for the exact answer and up to 800 for a near one (`locationPoints`, `yearPoints`). Streaks are counted for the stats but add no points.
- When a match finishes, `applyMatchStats` writes cumulative per-user stats to the store (see Persistence below), and `recordWin` adds it to the room's scoreboard (`room.board`: matches finished, and per player their wins and matches played, kept after they leave). The winner is first place with points; a tie for first counts for nobody unless a tiebreak settled it. Like the rest of the room it lives only in memory. `publicState` sends it as `board`, shown at the bottom of the settings panel (`RoomBoard.jsx`).
- **Trivia** (`"opciones"`, `QUIZ_GAME`, the main mode) reuses the same loop. Its settings live in `config.quiz` (`rounds` 5–20, `roundMs` 15–35 s, and three lists of what's ticked, all by default: `categories`, `formats` `opciones|escribir` and `difficulties` `facil|media|dificil`; there is no "mixta" or "mezcla" choice, and the settings show a tick box on each chip). Any list can be unticked (the match then can't start). An older client's single `difficulty` is still understood. `game/quiz.js` builds its pool with `quizPool()`: the bank's own questions (`multiple_choice`, and `open`/`year` rows of mode `opciones` or null), plus Encuentra el país's capitals and flags (`open`) and Línea del tiempo's events (`year`); map questions stay in Encuentra el país. `opciones` covers choosing (four options, or a year on the timeline) and `escribir` writing. `pickQuizQuestions` shares the rounds evenly between the kinds of question (four options, year, written), never two about the same country or year, and turns each into a track with a `type`: `choice` (options shuffled), `open` or `year` (with its timeline range). Each round is played by its type: `choice` answers are option indexes that `submitQuizAnswer` only records during `playing` and `gradeQuiz()` scores all at once at the reveal; `open` answers go through `submitAnswer` and `isCorrectOpenAnswer` like Encuentra el país's; `year` rounds use `placeYear`/`gradeYears` like Línea del tiempo's (`isYearRound`, `isChoiceRound`). `publicQuestion()` never sends the question id; it withholds the options, the flag and the timeline range until `playing`, and the right answer and per-option `picks` until `reveal`. In the lobby `publicState` also sends `questionCounts` (questions per topic, way of answering and difficulty, for the settings' chips). The reveal lasts `QUIZ_REVEAL_MS` (5s), or `HISTORY_REVEAL_MS` for a year. The frontend lives in `src/modes/quiz/` (route `/quiz/:code`; `Game.jsx` has one component per type and reuses `historia/Timeline.jsx`) with styles in `styles/quiz.css`.

### Question bank (Opción múltiple, Geografía and Historia)

The trivia modes read the Supabase table `questions`, loaded once at boot by `src/questions/questionBank.js` and passed to `RoomManager`; each mode filters its own rows by `mode` (`opciones`, `mundo` or `historia`). Opción múltiple's rows come from a private file; Geografía's are generated from a committed country list and Historia's from a committed list of events (see below).

- **Opción múltiple's real questions must never be committed: the GitHub repo is public.** They live in the Supabase table `questions` and in the git-ignored file `backend/private/questions.json`.
- `questions/questionBank.js` `loadQuestions()` runs at boot and passes the bank to `RoomManager`. It reads the Supabase table (active rows), else the private file, else the obviously fake placeholders in `questions/sampleQuestions.js`. The table has RLS on and no policies, so only the backend's service-role key can read it. Never add a public read policy or an API route that lists questions.
- Row shape (`questions/questionSchema.js`, `backend/supabase/schema.sql`): `id, type, mode, category, difficulty, language, prompt, data, active, created_at`. Played types: `multiple_choice` (`data = { options: [4 texts], correct: index }`), `open` (`data = { answer, aliases, reject }`, plus `flag` on flag questions), `location` (`data = { name, map }`) and `year` (`data = { year }`, negative before Christ, never 0); `true_false` and `audio` are reserved. `mode` is the game id (`opciones`, `mundo`) or null for any. Categories are the ids in `QUESTION_CATEGORIES` (`ciencia`, `historia`, `literatura`, `musica`, `arte`, `deportes`, `peliculas_series`, `videojuegos`, `geografia`, `cultura`); players see the display names.
- `npm run questions:upload --prefix backend` validates the private file (nothing is uploaded if any row is wrong) and upserts it by id. Rows without an id get a uuid written back into the file. `-- --check` only validates and prints counts per category and difficulty; `-- --prune` also deletes database rows that aren't in the file, except Geografía's (`mode = 'mundo'`) and Historia's (`mode = 'historia'`), which belong to `geo:upload` and `history:upload`.

### Geografía (id `mundo`, `GEO_GAME`)

Three kinds of question, each with fácil/media/difícil: **capitales** and **banderas** (written answer) and **ubicación** (a pin on the world map). Settings live in `config.geo` (`rounds` 5–25, `roundMs` 15–35 s for written answers, `kinds`, `difficulty` `facil|media|dificil|mixta`); `game/geo.js` has the limits, `pickGeoQuestions` (the chosen kinds share the rounds evenly, never two questions about the same country) and the map scoring.

- **Questions:** `geo/countries.js` lists the 194 countries (Spanish name, capital, aliases, difficulty per kind, their name in the map file). `geo/geoQuestions.js` turns it into `questions` rows with stable uuids, and adds to each written question's `reject` every other country's answer the typo tolerance would accept ("Viena"/"Vilna", "Níger"/"Nigeria"). `npm run geo:upload --prefix backend` upserts them to Supabase and deletes `mundo` rows that are gone (`-- --check` only validates). `geoBank()` uses the Supabase rows and fills any kind they lack from `countries.js`, so the mode works before (or without) the upload. The `location` type needs the `questions_type_check` constraint from `schema.sql`.
- **Written rounds** are checked with `isCorrectOpenAnswer` (`game/openAnswers.js`) and scored like songs. A flag is served by `/api/geo/flag/<token>` (`geo/flags.js` downloads it from flagcdn and keeps it in memory): the token is random so the image's address never names the country.
- **Map rounds** always last `LOCATION_ROUND_MS` (10 s). Clients send pins with the socket `game:pin` (`{ lng, lat, lock }`, store action `placePin`): a pin can move until locked, and the last one counts when time runs out. `gradeMap()` judges them at the reveal with `geo/worldMap.js` `locate()` (inside, km to the nearest border, nearest point), using the same `world-atlas` 50m file the frontend draws: inside (with `INSIDE_TOLERANCE_KM`) gets 1000 points, outside fewer the further away.
- **Tiebreak:** after the last round, if two or more connected players share the top score, `beginTiebreak()` adds a map round only they play (`room.tiebreak`, the others get status `mirando`). Pins move until confirmed and a confirmed pin is final: the first one confirmed inside the country ends the round and wins; otherwise the closest pin wins regardless of time. No winner means another tiebreak, up to `MAX_TIEBREAKS` (3). It gives no points; `rankedPlayers()` puts the winner first in the results and the stats (`tiebreakWinner`).
- `publicState` sends only the kind during the countdown, then the prompt (and the country to find, or the flag's token address) while playing; `reveal` has the answer, the flag and the map names of the country, and each player's `lastAnswer` carries their pin, distance and nearest point.
- **Frontend:** `modes/mundo/` (route `/mundo/:code`): `Game.jsx`, `WorldMap.jsx`, `worldData.js` (loads `world-atlas/countries-50m.json` only when needed, Natural Earth projection, `countryAt`, `REGIONS`), `GeoSettings.jsx`, `LobbyPanel.jsx`, `StartButton.jsx`; styles in `styles/geo.css`. A match is one fixed frame (`.tv-geo-stage`, as tall as the screen under the top bar via `--geo-top`, so nothing is scrolled): the top card always has three lines (kicker, title, hint) and the map card fills the rest. The same `WorldMap` stays for the whole match (`resetKey` = round flies it back to the world): map rounds put pins on it; written rounds (capital, flag) float the flag and the answer box over it (near the top, clear of a phone's keyboard) and their reveal flies to the country (`reveal.map` comes for every kind). Under the map, a row of constant height holds Confirmar / Saltar or the result (`Verdict`). On a computer the full scoreboard (`MiniBoard`) is at the side; below 900 px a strip (`components/home/ScoreStrip.jsx`, shared with Historia) is in the frame instead, and `html.tv-geo-playing` hides the top bar and locks the page's scroll during the match. `WorldMap` controls: tap/click places the pin, which can also be dragged; drag pans with a glide (the right and middle mouse buttons only drag, without the context menu); wheel (animated steps), trackpad/finger pinch, double tap/click and the +/− buttons zoom; continent buttons (`REGIONS`) jump there; the widest view fits the whole world in both directions, and a view may overshoot the map's edge a little so a region near it can be centred; the country under the pin (and under the mouse) is highlighted; from 2× zoom, islands and microstates too small to see get a dot, and a tap on a dot out at sea lands on that country; arrows, +/− and Enter work from the keyboard. Reveal flies to the country and the pins.

### Historia (id `historia`, `HISTORY_GAME`)

An event is shown and every player picks its year on a timeline; the closer, the more points. Settings live in `config.history` (`rounds` 5–25, `roundMs` 10–30 s, `eras` `antigua|media|moderna|contemporanea`, `difficulty` `facil|media|dificil|mixta`); `game/history.js` has the limits, the ages (`eraOf`: the event that opens an age belongs to it, 476/1492/1789), `pickHistoryQuestions` (the chosen ages share the rounds evenly, never two events of the same year) and the scoring.

- **Events:** `history/events.js` is the list (`[year, difficulty, text]`; the text never gives the year or the century away). `history/historyQuestions.js` turns it into `questions` rows of type `year` with stable uuids; `npm run history:upload --prefix backend` upserts them and deletes `historia` rows that are gone (`-- --check` only validates). `historyBank()` uses the Supabase rows of mode `historia` when there are any, else the list. The `year` type needs the `questions_type_check` constraint from `schema.sql`.
- **Timeline:** each event's range is drawn per match by `yearRange()`: a span by age (`TIMELINES`: 1500 years for antiquity, 750, 300, 150 for the contemporary age) between round numbers, with the year strictly inside at a random position. A recent event's line may reach the next round year after today; those years show striped and `placeYear` refuses them. Year 0 doesn't exist: never an end, refused by the server, skipped by the buttons, and `yearsApart()` counts −1→1 as one year.
- **Answers:** socket `game:year` (`{ year, lock }`, store action `placeYear`), like Geografía's pins: the year moves until locked, the last one counts when time runs out (the client sends it 250 ms after it stops moving). `gradeYears()` judges at the reveal (`HISTORY_REVEAL_MS`, 6 s): the exact year gets 1000 points and counts as a hit (streak, `correct`); otherwise `yearPoints()` falls with the distance at a pace set per age (`YEAR_FALLOFF`: 150 years for antiquity down to 15 for the contemporary age), not by the line's length, so a longer line only leaves more room to miss.
- **Tiebreak:** the same as Geografía's (`beginTiebreak`, `settleTiebreak`), with an event not asked in the match: the first to confirm the exact year wins (reason `exacto`), otherwise the closest year; equally close means another tiebreak.
- `publicState` sends the event from the countdown on, its range (`min`, `max`) from `playing`, and the year only in `reveal`; each player's `lastAnswer` then carries their `year` and `diff`, and `me.guess` the unlocked year (for reloads).
- **Frontend:** `modes/historia/` (route `/historia/:code`): `Game.jsx` (the event, the chosen year with ±1 / ±tenth buttons, keys ← → ↑ ↓ Inicio Fin Enter, and at the reveal who came closest), `Timeline.jsx` (tap or drag on the line; at the reveal the right year in green and everyone's year with their name), `HistorySettings.jsx`, `LobbyPanel.jsx`, `historyInfo.js`; styles (terracotta, `--tv-hm-*`) in `styles/history.css`. Phones get the `ScoreStrip`, since the room's column is hidden there.

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
- Home is the multiplayer hub. The Jugar sheet (`components/home/PlaySheet.jsx`) creates or joins a room, asking for a guest name first when there isn't one. `components/home/PartyPanel.jsx` shows the code, the players (tapping one opens their profile and, for the host, the settings permission) and the invite link `/sala/:code`, which also renders Home and auto-joins. A room's own address is `/sala/:code`: creating or joining one moves Home there, and leaving (the red button, or the top-bar button tapped twice) goes back to `/`. That top-bar button, left of the logo (`useRoomExit` in `TvTopbar.jsx`; phones get the same one in `RoomHeader`), says "Volver" and goes back one step: to the game menu for the host while a game's panel is open, and anywhere else in the room out of it, after asking "¿Salir de la sala?" (two taps). On a match's own screen it becomes an "X" that opens a confirm modal (`ConfirmDialog.jsx`, the Jugar sheet's look) asking if you want to leave the game. On any other page (profile, login) the same button says "Volver" too and goes back to the room, or to the match if one is running, and to Inicio when there is no room; there is no separate "Volver a la sala" chip any more. The profile chip of the top bar (and the avatar of the phones' `RoomHeader`) only shows on Home and on the game menu (a room with no game picked): not with a game picked, in a match, or on other pages. The logo beside it is not a button. The room screen (Home with a room) never changes page while the room waits: the host taps a mode tile and every player's screen swaps in that mode's `Lobby` panel (settings, start button) with an animation. Only starting a match moves players to the game screen.
- The mode tiles come from the registry in `src/modes/index.js` (`GAME_MODES`). Each entry has a `kind`: `"main"` (Trivia, whose tile is as wide as two) or `"extra"` (the others, two by two under it; a grey "Más modos pronto" tile closes an odd row). All tiles look alike otherwise: name and icon, no description. On a computer they keep a fixed height instead of filling the panel, and hover lifts them straight up. To add a mode:
  - add an entry there with `available: true`, a `kind`, a `Lobby` panel component and a `path(room)` for its in-match screens
  - add the id to `GAME_IDS` in `roomManager.js`
- `RoomNavigator` in `App.jsx` does all room-driven navigation. It sends each client to `roomPath(room)` (`/sala/:code` while the room is in `lobby`, the mode's `path` during a match) and swaps out stale `/game` or `/sala` screens of the player's own room. It pulls players off other pages (profile, leaderboard) only when a match starts. Old `/lobby/:code` links redirect to `/sala/:code`. Game pages should not navigate on phase changes themselves. While the room waits, the browser's Back button works as "Volver": `/sala/:code` is always pushed on top of Home (an invite link gets a Home put under it), so Back lands on Home with the room still open, `RoomNavigator` runs the same `step` as the button (`useRoomExit`) and pushes the room screen again. Leaving must replace the history entry (`nav("/", { replace: true })`), never push, or Back returns to `/sala/:code` and joins the room again. During a match Back is not handled.
- All other routes, including the music mode's pages in `src/modes/music/` (Setup → Lobby → Game), render inside `LegacyShell` in `App.jsx`. That shell adds the old navbar `Layout` and uses the older design tokens in `styles/global.css`.
- There is a single look: the dark page with option 1's colours, fonts and confetti pattern (`styles/palettes.css`). The colour-options button and options 2–5 were removed; `lib/theme.js` only clears their old saved choice from `localStorage`. `index.html` sets `data-theme="dark"`.

### Environments and deployment

- **Local dev:** leave `VITE_API_URL` unset. `BACKEND_URL` is then `""`, and Vite proxies `/api` and `/socket.io` to `127.0.0.1:8080`. If `VITE_API_URL` is set to the Railway URL, local dev talks to production.
  - The `/auth` proxy entry has a `bypass` that returns `false`, which makes Vite answer 404 for every `/auth/*` request. As a result, the Google OAuth redirect and callback don't work through `:5173` as currently configured.
- **Production:**
  - The frontend is on Vercel. `frontend/vercel.json` rewrites `/api` and `/auth` to the Railway backend and sends everything else to the SPA. Socket.IO connects directly to `BACKEND_URL`.
  - The backend is on Railway, port 8080. It also serves `frontend/dist` as a static SPA fallback when that folder exists.
- The backend loads `.env` from `backend/` and from the repo root. Variables: `PORT`, `CLIENT_ORIGIN`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` (optional, defaults to `<CLIENT_ORIGIN>/auth/spotify/callback`).

