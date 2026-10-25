# Public matches (Casual and Competitivo)

## Pages
- Inicio (`/`, `PlayPage.jsx`): the big logo and two tiles, **Pública** and **Privada**. Each opens a page laid out like a game's lobby (`.tv-play-row`, `ModeStage` card + settings; `styles/lobby.css`).
- **Pública** → `/jugar/casual` or `/jugar/competitivo` (`BigChoice` cards: kind and size, Uno contra Uno = 2, Todos contra Todos = 5; last kind in `trivially_public_kind`). **Competitivo is closed for now** (`soon` in `KINDS`; the server refuses it via `MATCH_KINDS_OPEN`).
- **Privada** → `/jugar/privada`: join by code (`joinWithCode`), online friends, "Crear sala".
- Without an account: `AccountNote` explains what needs one; `PlaySheet.jsx` asks the name (`askName`, `onNamed`).
- Navigation: the top bar's "Volver" is the only way back (`useGoUp`, `upPath`); leaving a room goes back to where it came from (`exitPath`). In a match it's an X that asks first (`endToMenu` for a private host).

## Server (`game/matchmaking.js`, tests `matchmaking.test.js`)
- `match:find { kind, size }` → `RoomManager.findMatch`: a lobby room with `room.matchmaking` and **no host** (nobody changes, pauses or ends it); not joinable by code or friends.
- Full → `checkMatchFull` waits `MATCH_FULL_MS` (3 s) → `startMatch` draws `MATCH_GAME_COUNT` (2) different variants from `MATCH_VARIANTS` (`trivia-cerradas`, `trivia-abiertas`, `rango-linea`, `rango-cifras`, `minas-turnos`, `minas-carrera`), 5 rounds each, played as a playlist in order.
- **Games won decide it:** `scoreMatchGame` (`run.gameWins`, `run.gameBase`); tied on games after two → `beginDecider` plays a third (`run.decider`). `rankedPlayers`/`matchWinner` go by games won, then points; equal games won = no winner.
- Own clock (`matchTimes`, `matchRoundMs`): 10 s a question, 15 s a song or country, 10 s a mines turn, 30 s a race or shower.
- `MATCH_SIZE` env var (1–5) caps the size (1: test alone).
- **Intro** before each game: phase `intro` (`INTRO_MS`: roulette + tutorial, `VARIANT_TUTORIALS` in `matchInfo.js`); from the second game, the previous game's result first (`INTRO_RESULT_MS`, `run.lastGame`, `PreviousGame`).
- `publicPlayer` sends `score` as this game's points (`score - run.gameBase`) and `wins`.

## Rank (Competitivo)
`game/rank.js`: `user.rank` `{ points, matches, wins, best }` moved by place (`PLACE_POINTS`), never below 0. Tiers `RANK_TIERS` (Bronce 0 … Maestro 1500, divisions of `DIVISION_POINTS` 100), mirrored in `frontend/src/lib/rank.js`. Tests `rank.test.js`.

## Bots (Casual)
- `scheduleBotArrival` adds a bot every second after `BOT_WAIT_MS` until full (`addBot`: `bot: true` server-only, guest-like id, a Spanish/English two-word name, `skill` 0.15–0.45). **Players must never be able to tell a bot from a person**: `bot` is never sent and no text mentions bots.
- `scheduleBots`/`botMove` act between `BOT_MIN_MS` and `BOT_MAX_MS` (3–8 s) into a round. A room with only bots closes (`hasPeople`). Bots get no stats.

## Leaving and inactivity (public only)
- Leaving mid-match (or dropping past the grace) is a forfeit (`forfeit`, "salió"/"inactivo"): never waited for, no wins, last place, can't come back. One left → they win (`endIfAlone`).
- After `PUBLIC_KICK_ROUNDS` (5) idle rounds, "¿Sigues ahí?" (`askStillThere`, `AFK_CONFIRM_MS` 15 s, `StillThere.jsx`, `room:present`); no answer → `afkExpire`. Tests `game/publicForfeit.test.js`. Private rooms never kick anyone.

## Client
- `MatchLobby.jsx`: the waiting screen in the same frame as `/jugar/casual` (search clock `useSearchStart`, seats).
- **One address for the whole match:** `/sala/CODE` (`isInlineMatch`, `roomPath`, `RoomScreen`/`GAME_SCREENS` in `App.jsx`); only the end is `/playlist/CODE`. `RoomNavigator` adds `tv-seamless` / `tv-seamless-side` on `<html>` for 1.4 s so screens swap without re-animating (lengths 0 s, not `none`).
- `MatchIntro.jsx` (`PanelRoulette`, tutorial), styles `styles/match.css`.
