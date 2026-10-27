# Public matches (Casual and Competitivo)

## Inicio and the group (`components/home/HomeFrame.jsx`)
- Inicio (`/`), the group's room (a private room, `/sala/CODE`) and the search for a public match are **one frame**: the game's card in the middle (`ModeStage`) and the group's bar at the bottom (`GroupBar.jsx`: "Tu grupo" with its faces, "+", the code with its copy button and "Unirse"; "Vas a jugar"; the one yellow button). "Arriba la info, al centro el juego, abajo tu grupo y la acción."
- **The plan** (`lib/plan.js`): the game and who it's for, `audience` **"publica"** ("Partida pública": a public match of that game) or **"grupo"** ("Partida privada"). Without a room it's this device's (`localStorage` `trivially_plan`, `useLocalPlan`); in a room it's `room.game` + `room.audience` (host only, `room:audience` / `setAudience`), remembered for Inicio when leaving (`rememberPlan`).
- **"¿Qué quieren jugar?"** (`PlanSheet.jsx`, from the "Vas a jugar" box): two pills (the audience) and the games as cards (`GameCard.jsx`); with "Partida pública" Rey de la colina and Farsante are locked ("Partida privada", `PUBLIC_GAMES`), and switching a room to it while in one of them moves it to Trivia. With the group, "Más formas de jugar": the Clásicos and the playlist. Non-hosts only look ("Lo elige Ana").
- Without a room: JUGAR (publica) → `findMatch("casual", …, game)`; picking a game with "grupo", "+" or EMPEZAR creates the group's room (`createRoom(…, audience)`; EMPEZAR also starts it). "Unirse" (`JoinSheet.jsx`) checks a code and joins. "Tu grupo" (`GroupSheet.jsx`): the code (copy code / link, hide), `PartyPanel` with `group` (players, menus, friends to invite, chat).
- In the group's room: EMPEZAR starts the group's match (`useStartGame`); JUGAR with "publica" takes the whole group to a public match (`findPublicForGroup`). Non-hosts see "Esperando a Ana…".
- The old pages `/jugar/casual`, `/jugar/competitivo`, `/jugar/privada` open Inicio on that side (`OPTION_AUDIENCE` in `Home.jsx`). Leaving a room goes to Inicio (`exitPath`). Without an account `PlaySheet.jsx` asks the name first (`askName`, `onNamed`) and HomeFrame then does what was asked. **Competitivo is closed for now** (the server refuses it via `MATCH_KINDS_OPEN`); its rank code stays.

## Server (`game/matchmaking.js`, tests `matchmaking.test.js`)
- `match:find { kind, size }` → `RoomManager.findMatch`: a lobby room with `room.matchmaking` and **no host** (nobody changes, pauses or ends it); not joinable by code or friends.
- **Only 5 players for now:** "Uno contra Uno" (2) isn't offered (`DUELS_OPEN` false in `matchmaking.js`; `hidden` in the client's `MATCH_SIZES`, so `PlaySheet` shows no size picker). Its code stays: an explicit `size: 2` still makes a duel (the tests use it). Setting `DUELS_OPEN` back to true brings back the game queue's two and the group's "one more than the group".
- **By game** (`match:find { kind, game }`, "Partida pública"): a queue per game (`matchmaking.game`; `PUBLIC_GAMES`: Trivia, Adivina la canción, Encuentra el país, Rango, Campo de minas, Lluvia), for five unless `size` says otherwise (two with `DUELS_OPEN`). It plays that game alone in its public way (`PUBLIC_VARIANT`: Trivia Cerradas, Rango Cifras, Campo de minas carrera, and the variants `cancion`, `pais`, `lluvia`, which the roulette never draws), one item (`publicGameItem`, with easy questions if need be), **no decider**, and its intro is only the tutorial (`introSpinMs` 0). `publicMatchmaking` sends `game`.
- **A group together** (`room:findPublic`, host, `findPublicForGroup`): the group's own room opens to its game's queue: it becomes a public room (`hostId: null`, bots, strangers searching that game sit in it) of `groupMatchSize` (5; with `DUELS_OPEN`, one more than the group, 2–5; at most `PUBLIC_GROUP_MAX` people), and `matchmaking.group` keeps what the room was (host, members, co-hosts, join mode, game, settings, playlist). `room:closePublic` (`closePublic`, anyone of the group, in the lobby or once it's `finished`): the strangers are sent home (`onKicked`, reason "grupo": "La partida terminó y el grupo volvió a su sala"), bots go, and the room is the group's again. With nobody of the group left in it, it's an ordinary public room (`removePlayer`). The results show "Volver al grupo" to the group and "Buscar otra partida" (the same game) to the rest. Tests `game/publicGroup.test.js`.
- Full → `checkMatchFull` waits `MATCH_FULL_MS` (3 s) → `startMatch` draws `MATCH_GAME_COUNT` (2) different variants from `MATCH_VARIANTS` (`trivia-cerradas`, `trivia-abiertas`, `rango-cifras`, `minas-carrera`), 5 rounds each, played as a playlist in order.
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
- The search is HomeFrame's `SearchCard`: "Buscando jugadores de Trivia…" with how long (`useSearchStart`), the game's queue ("Fila de Trivia · 5 rondas · 10 s · Cerradas", `publicMatchLine` in `matchInfo.js`) and how many were found; once full, "¡Partida completa!" and "Empieza en 3". Its button is CANCELAR (grey): the group's `closePublic`, or leaving the room.
- **One address for the whole match:** `/sala/CODE` (`isInlineMatch`, `roomPath`, `RoomScreen`/`GAME_SCREENS` in `App.jsx`); only the end is `/playlist/CODE`. `RoomNavigator` adds `tv-seamless` / `tv-seamless-side` on `<html>` for 1.4 s so screens swap without re-animating (lengths 0 s, not `none`).
- `MatchIntro.jsx` (`PanelRoulette`, tutorial), styles `styles/match.css`.
