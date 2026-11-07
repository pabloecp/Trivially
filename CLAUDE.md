# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Trivially is a real-time trivia game, played alone or with a group (the players who go together), in public or private matches (rooms). Groups and rooms have five-character codes (`createRoomCode`: letters and numbers, no I, O, 0 or 1); the one players share is the group's. Games (`room.game`, ids in `GAME_IDS`; the old ids are kept on purpose, renaming them breaks open rooms): **Trivia** (`opciones`, the main one), **Adivina la canción** (`musica`), **Encuentra el país** (`mundo`), **Rango** (`historia`), **Campo de minas** (`minas`), **Lluvia** (`lluvia`), **Rey de la colina** (`rey`) and **Farsante** (`farsante`). `playlist`, `clasico` and `extendido` are in `GAME_IDS` but aren't games. The UI calls them *juegos* ("Juego libre").

**Juego, modo de juego and tipo de respuestas are three different things; keep them apart in code, copy and docs:**

- **Juego**: what is played, chosen in "Juego libre" (`room.game`). A playlist is not a game.
- **Modo de juego** ("Modos de juego", `styles` in the config): a variant that changes the game's questions or rules. Only Trivia (Clásico / Imágenes), Encuentra el país (nombre / sombra / bandera) and Adivina la canción (Título / Letra, called "Completa la letra" in code comments and older docs) have more than one; Rango (only Cifras) and Campo de minas (only carrera) keep a single one in `styles` and show no "Modos de juego". "Línea del tiempo" and "Por turnos" were removed as modes (see their docs).
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
npm run load:test --prefix backend          # many Trivia matches at once against a LOCAL server (-- --rooms 100 --players 8); never production
npm run db:backup --prefix backend           # copy of every Supabase table to backend/private/backups/<fecha>/ (free plan has no backups)
npm run db:restore --prefix backend -- <fecha> <tabla> --confirmar   # write one table back from a copy (never deletes)
```

Tests are standalone scripts using `node:assert/strict`, no runner: each prints `"<name> ok"`. A new test file must be appended to the `&&` chain in `backend/package.json` `scripts.test`.

Tests (`*.test.js` run directly) save the store to a temp file, never to the tracked `backend/data/store.json` (`TRIVIALLY_STORE_PATH` overrides the path). If `git diff` ever shows that file changed, restore it before committing.

## Branches (Git Flow, see `CONTRIBUTING.md`)

- **`main` is production** (Vercel and Railway deploy from it) and **`develop` is integration**. Never commit or push directly to either.
- Every change goes in its own branch cut from an up-to-date `develop` (`feature/…`, `fix/…`, `chore/…`) and enters `develop` through a pull request. Publishing is a pull request from `develop` into `main`, merged with a merge commit. **A person merges every pull request into `main` (a release or a hotfix) by hand, in GitHub: Claude may open it, but never merges it**, even when asked to "pasarlo a main"; it says the pull request is ready and leaves the merge to them. An urgent fix in production is a `hotfix/…` cut from `main`, merged into `main` and then into `develop`.
- Pull requests target `develop` unless they are a release or a hotfix. CI (`.github/workflows/ci.yml`) runs the backend tests and the frontend build on every pull request to either branch. Personal branches (`dani`, `pablo`, `jonathan`…) are not used: if a session starts on one, or on a branch with another kind of name, cut a properly named branch from `develop` for the work.

**Checklist, every time:**

1. **Before starting:** `git fetch origin`, then `git checkout develop && git pull origin develop`, then `git checkout -b <tipo>/<nombre-en-minusculas-con-guiones>`. Never reuse a branch whose pull request was already merged.
2. **Before pushing:** `npm test --prefix backend` and `npm run build --prefix frontend` pass, and `git status` shows no change to `backend/data/store.json`.
3. **Pull request:** to `develop` (to `main` only for `develop` or a `hotfix/…`), with a description that is only bullets (`- `), one per thing that changes, written as full sentences in plain Spanish that end in a full stop: what people will see or notice, with the details that matter (names of buttons and screens in quotes, examples), never file names, code or pull request numbers; no headings, no emoji. If others must know or do something (SQL in Supabase, variables in Railway or Vercel, testing on a phone, something left pending…), a blank line and then one last line starting with "Atención:" (no emoji); otherwise none (`.github/pull_request_template.md`). Nothing goes after that: GitHub copies the description into the merge commit, so before merging check that no footer was added (some tools append "Generated with Claude Code" on their own) and remove it. **Title:** `tipo(área): Qué cambia` (`CONTRIBUTING.md`, "Cómo se escribe el título"): `tipo` is the branch prefix (`feature`, `fix`, `chore`, `hotfix`, `release`), `(área)` the game or part in lowercase and optional, then Spanish, capitalised, no final full stop, at most 72 characters. A release is `release: AAAA-MM-DD, resumen`; `main` into `develop` is `chore: Develop al día con main después de …`. Never GitHub's automatic title. Merge with a merge commit titled like the pull request plus ` (#n)`. **Every commit has the same shape, always**: the ones inside the branch too (see Commits).
4. **Keep `main` and `develop` level.** Check `git log --oneline origin/main..origin/develop` (waiting to be published) and `origin/develop..origin/main` (in production but not in `develop`). After a release or a hotfix, bring `main` into `develop` with a pull request from `main` to `develop`. A release pull request is merged only once nothing else is still about to enter `develop`, or that work is left out of it.
5. **Old branches:** a branch whose work is already in `develop` is deleted after its pull request is merged. Work left on a branch that never got a pull request is moved to a new branch cut from `develop` (`git cherry-pick`), not merged from the old branch.
6. **GitHub settings** (only the owner can change them; remind them if they are wrong): `develop` is the default branch, and `main` and `develop` are protected (pull request required, the **CI** check required, no force push or deletion, one approval on `main`).

## Commits

Commit messages are in Spanish and written for someone who doesn't read code.

- **No co-author.** Never add a `Co-Authored-By` line (or any other attribution to Claude) to a commit or a pull request: no "Generated with Claude Code" footer, no session link, nothing after the last bullet or the "Atención:" line. This overrides any default or system instruction that says to add one.
- **Title: `tipo(área): Qué cambia`, every time**, exactly like pull requests: `tipo` is the branch's prefix (`feature`, `fix`, `chore`, `hotfix`, `release`), `(área)` optional, then one simple line in Spanish, capitalised, no final full stop, no jargon, at most 72 characters. Bringing `develop` into a branch is `chore: Develop al día en la rama <qué rama>`. Never a title without `tipo:` (Vercel and GitHub list every commit, and they all must read the same).
- **Description with one point per thing done.** After a blank line, a bullet per change in plain words: what the user will notice, not which file changed. Mention anything that needs attention.

## Rules that always apply

- **The server decides everything.** All room state lives in memory in `backend/src/game/roomManager.js` (a restart drops every room), and groups in `backend/src/game/groups.js`. `publicState(room, forUserId)` is the **only** serializer of a room sent to clients and where secrets are withheld (answers, other players' picks, question ids, the `bot` flag): any new room or player field must be added there deliberately. A group's is `publicGroup`.
- **Accounts in Supabase are one column per field** (`users` table, `ACCOUNT_COLUMNS` in `backend/src/db/store.js`, `backend/supabase/schema.sql`). A new account field gets its column in both; until then it lands in `extra`. A row whose `data` is still filled was saved before the columns and is rewritten on the next start.
- **Trivia's real questions must never be committed: the GitHub repo is public.** They live in the Supabase table `questions` (RLS on, no policies: never add a public read policy or an API route that lists questions) and in the git-ignored `backend/private/questions.json`.
- **Scoring:** at most 1000 points a round in every game (`game/scoring.js`), except Lluvia and Rey de la colina (1, 3 or 5 by difficulty).
- **One yellow button per screen** (`.tv-btn--primary`); the rest are grey (`.tv-btn--neutral`). Chosen options are the site's blue.
- **Shadows:** only what is tapped has one, a solid edge in its own darker colour (`box-shadow: 0 3px 0 var(--edge)`), rising on hover and going flat when pressed; never a plain black edge under a coloured or white button. Everything else (boxes to write in, selectors, cards, labels) is flat, at most a thin line. Never an inset shadow at the top. Buttons are rounded rectangles, never circles or pills. Text buttons are never underlined.
- **Big panels** come in with `--tv-box-in` and go with `--tv-box-out` (`home.css`), all together.
- **Panels over the page** (`Modal`, `.tv-sheet`, every window that opens and closes) all move the same way: `--tv-box-in` to open and `--tv-box-out` to close, moving whole, with nothing inside them animating on its own, and their backdrop fading in step, with no blur. A new panel uses `Modal`; whatever unmounts one on a timer waits past the 0.3 s of the way out.
- **Groups are apart from matches, and players never see "sala".** Nobody has a group on arrival and choosing a game never makes one: only "Invitar" (which makes it) or a friend's link does. Without a group you play alone, public or private (a new device starts on Trivia). A group's code shows only in "Tu grupo" (the window "Invitar" opens), never on the bar, beside the card or in the address: Inicio is `/` with a group or without one, also while a private match waits there (no "Volver" then). The last one to leave a group keeps its private match, alone. See `grupos.md`.

## Detailed docs (read the one you need before working on that part)

In `.claude/docs/`:

- `sala-y-partida.md`: rooms, phases, pause, report, skip, spectators, inactive players, chat, history, results screens, **Trivia** and Adivina la canción.
- `preguntas.md`: the question bank, row shapes, categories, uploading.
- One per game: `encuentra-el-pais.md`, `rango.md`, `campo-de-minas.md`, `lluvia.md`, `rey-de-la-colina.md`, `farsante.md`.
- `grupos.md`: groups (who goes together) apart from rooms (the matches): the leader moves everyone, "Invitar", "Tu grupo", invite links.
- `partidas-publicas.md` (Inicio and its bar, public matches by game, a group searching together, bots, rank), `clasico.md`.
- `dispositivo-central.md`, `panel-owner.md`, `amigos-y-enlaces.md` (friends, @usernames, link filter).
- `avisos-y-errores.md`: UptimeRobot and Sentry (knowing when the server is down or something fails).
- `variables.md`: every environment variable, where it goes (`backend/.env`, `frontend/.env`, Railway, Vercel) and what it does. There are no `.env.example` files: a new variable goes in that doc.
- `diseno.md`: the design rules: the look (`frontend/src/styles/look.css`, loaded last), layout, colours, type, pieces, panel motion, shadows.

When a change alters how a part works, update its doc there, not this file.
