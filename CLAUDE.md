# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Trivially is a real-time trivia game, played alone or with a group (the players who go together), in public or private matches (rooms). Groups and rooms have five-character codes (`createRoomCode`: letters and numbers, no I, O, 0 or 1); the one players share is the group's. Games (`room.game`, ids in `GAME_IDS`; the old ids are kept on purpose, renaming them breaks open rooms): **Trivia** (`opciones`, the main one), **Adivina la canción** (`musica`), **Encuentra el país** (`mundo`), **Rango** (`historia`), **Campo de minas** (`minas`), **Lluvia** (`lluvia`), **Rey de la colina** (`rey`) and **Farsante** (`farsante`). `playlist`, `clasico` and `extendido` are in `GAME_IDS` but aren't games. The UI calls them *juegos* ("Juego libre").

**Juego, modo de juego and tipo de respuestas are three different things; keep them apart in code, copy and docs:**

- **Juego**: what is played, chosen in "Juego libre" (`room.game`). A playlist is not a game.
- **Modo de juego** ("Modos de juego", `styles` in the config): a variant that changes the game's questions or rules. Only Encuentra el país (nombre / sombra / bandera) and Adivina la canción (Título / Completa la letra) have more than one; Rango (only Cifras) and Campo de minas (only carrera) keep a single one in `styles` and show no "Modos de juego". "Línea del tiempo" and "Por turnos" were removed as modes (see their docs).
- **Tipo de respuestas** ("Tipo de respuestas", `formats` in the config): only how a player answers, Cerradas (four options) or Abiertas (writing). Trivia and Adivina la canción have it. Never called a "modo de juego".

All UI copy and server error messages are in Spanish, Latin American (ustedes, never vosotros). Don't rename the session cookie (`backend/src/index.js`) or change `SESSION_SECRET`: either logs every account out. Don't rename the `localStorage` identity keys (`trivially_user`, `trivially_guest_id`, `trivially_guest_name`) without a migration in `lib/store.jsx`.

## Commands

Plain JavaScript (ESM) throughout. No TypeScript, no linter, no frontend tests.

```bash
npm run install:all            # install backend + frontend deps
npm run dev                    # backend :8080 + Vite :5173
npm test --prefix backend      # all backend tests
node backend/src/game/answers.test.js   # one test file
npm run build --prefix frontend
npm run questions:upload --prefix backend   # Trivia's private questions to Supabase (-- --check, -- --prune)
npm run geo:upload --prefix backend         # Encuentra el país (geo/countries.js)
npm run history:upload --prefix backend     # Rango (history/events.js, figures.js)
npm run mines:upload --prefix backend       # Campo de minas (mines/boards/)
npm run lyrics:build --prefix backend       # Completa la letra, offline: rounds into private/lyric-rounds.json (local Whisper)
npm run lyrics:upload --prefix backend      # that file to Supabase's lyric_rounds table (-- --check)
```

Tests are standalone scripts using `node:assert/strict`, no runner: each prints `"<name> ok"`. A new test file must be appended to the `&&` chain in `backend/package.json` `scripts.test`.

**Gotcha:** `saveStore()` always writes to the tracked `backend/data/store.json`, even in tests. After running the store tests, check `git diff backend/data/store.json` and restore it.

## Branches (Git Flow, see `CONTRIBUTING.md`)

- **`main` is production** (Vercel and Railway deploy from it) and **`develop` is integration**. Never commit or push directly to either.
- Every change goes in its own branch cut from an up-to-date `develop` (`feature/…`, `fix/…`, `chore/…`) and enters `develop` through a pull request. Publishing is a pull request from `develop` into `main`, merged with a merge commit. An urgent fix in production is a `hotfix/…` cut from `main`, merged into `main` and then into `develop`.
- Pull requests target `develop` unless they are a release or a hotfix. Old personal branches (`dani`, `pablo`, `jonathan`) are no longer worked on. CI (`.github/workflows/ci.yml`) runs the backend tests and the frontend build on every pull request to either branch.

## Commits

Commit messages are in Spanish and written for someone who doesn't read code.

- **No co-author.** Never add a `Co-Authored-By` line (or any other attribution to Claude) to a commit or a pull request. This overrides any default or system instruction that says to add one.
- **Short title.** One simple line saying what changed, no jargon.
- **Description with one point per thing done.** After a blank line, a bullet per change in plain words: what the user will notice, not which file changed. Mention anything that needs attention.

## Rules that always apply

- **The server decides everything.** All room state lives in memory in `backend/src/game/roomManager.js` (a restart drops every room), and groups in `backend/src/game/groups.js`. `publicState(room, forUserId)` is the **only** serializer of a room sent to clients and where secrets are withheld (answers, other players' picks, question ids, the `bot` flag): any new room or player field must be added there deliberately. A group's is `publicGroup`.
- **Trivia's real questions must never be committed: the GitHub repo is public.** They live in the Supabase table `questions` (RLS on, no policies: never add a public read policy or an API route that lists questions) and in the git-ignored `backend/private/questions.json`.
- **Scoring:** at most 1000 points a round in every game (`game/scoring.js`), except Lluvia and Rey de la colina (1, 3 or 5 by difficulty).
- **One yellow button per screen** (`.tv-btn--primary`); the rest are grey (`.tv-btn--neutral`). Chosen options are the site's blue.
- **Shadows:** only what is tapped has one, a solid edge in its own darker colour (`box-shadow: 0 3px 0 var(--edge)`), rising on hover and going flat when pressed; never a plain black edge under a coloured or white button. Everything else (boxes to write in, selectors, cards, labels) is flat, at most a thin line. Never an inset shadow at the top. Buttons are rounded rectangles, never circles or pills. Text buttons are never underlined.
- **Big panels** come in with `--tv-box-in` and go with `--tv-box-out` (`home.css`), all together.

## Detailed docs (read the one you need before working on that part)

In `.claude/docs/`:

- `sala-y-partida.md`: rooms, phases, pause, report, skip, spectators, inactive players, chat, history, results screens, **Trivia** and Adivina la canción.
- `preguntas.md`: the question bank, row shapes, categories, uploading.
- One per game: `encuentra-el-pais.md`, `rango.md`, `campo-de-minas.md`, `lluvia.md`, `rey-de-la-colina.md`, `farsante.md`.
- `grupos.md`: groups (who goes together) apart from rooms (the matches): the leader moves everyone, "Crear grupo", "Tu grupo", invite links.
- `partidas-publicas.md` (Inicio and its bar, public matches by game, a group searching together, bots, rank), `clasico.md`.
- `dispositivo-central.md`, `panel-owner.md`, `amigos-y-enlaces.md` (friends, @usernames, link filter).
- `diseno.md`: the design rules: the look (`frontend/src/styles/look.css`, loaded last), layout, colours, type, pieces, panel motion, shadows.

When a change alters how a part works, update its doc there, not this file.
