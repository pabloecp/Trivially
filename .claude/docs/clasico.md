# Clásico (id `clasico`; `extendido` is a longer one, not offered)

**Games drawn by the roulette, one after another, until someone has won two** (`CLASSIC_WINS`, `MATCH_WINS` 2 in `matchmaking.js`). It's the "Clásico" tile at the top of "¿Qué quieren jugar?" (`PlanSheet.jsx`, "Primero en ganar dos juegos"), on both sides:

- **"Partida pública"**: the roulette's public match (`partidas-publicas.md`): JUGAR searches without a game (`findMatch("casual", …, null)`; the plan's game is `clasico`, `CLASSIC` in `lib/plan.js`), with bots, no host.
- **"Partida privada"**: a room whose game is `clasico`, for its own players: same roulette, variants, clocks and rule, but started by its host, with no search or bots. Its rank and elo move as in a public one, between accounts (`partidas-publicas.md`, "Elo, matchmaking and rank").

## The rule (server, both sides)
- Each game is won by whoever scores the most in it (all of them on a tie for the most, nobody when nobody scored: `scoreMatchGame`). The match is won by the first who alone has won 2 (`matchDecided`): two who get there in the same game play another one ("Juego de desempate").
- All its games are drawn at the start (`drawMatchItems`, all different while there are variants left, never one twice in a row; `matchMaxGames(players)` of them: enough for each player to win one and two more), but only the 2 it always takes are in `run.items`; the rest wait in `run.upcoming` (`playUntilWins`), never sent. After each game nobody has won the match in, `beginNextGame` adds the next one (its rounds drawn then) with its roulette and tutorial. Out of games, whoever has won the most wins; equal = no winner (`matchWinner`).
- `run.winsToWin` (sent as `run.winsToWin` and `intro.winsToWin`) marks a match of the roulette; a public match of one game searched for by name has none.

## Rank, not elo
- The Clásico has a **rank** (Bronce, Plata, Oro, Diamante, Maestro, Leyenda: `game/rank.js`), moved once at the end of the match by the place in it. Each of its games moves **that game's elo** when it ends, by the place in that game: you can win the Clásico and lose elo in the game you lost.

## Code
- In `GAME_IDS` but not games (`kind: "classic"`, hidden by `isGameTile`). `CLASSIC_WINS`/`CLASSIC_NAMES`/`isClassic`/`PUBLIC_CLASSIC` in `matchmaking.js`; a group's plan can be `clasico` on both sides (`cleanPlan` in `groups.js`).
- Private: `start()` → `startClassic` (run with `run.classic`). `endRun`, `stopRun` and `setGame` return to the Clásico. A match of several games (Clásico, public matches) uses `game/playlist.js` (`newRun`, `recordGame`) and ends on `modes/playlist/Results.jsx`; the rooms' own "Playlist" game was removed. Public: `startMatch`.
- Client: the mode in `modes/index.js` (`wins`, `steps`); its card on Inicio and in its lobby is `ModeStage` in the logo's look, with its tutorial (no settings): `modes/clasico/LobbyPanel.jsx` is only that card. "Vas a jugar" in the logo's look too (`GroupBar.jsx`). The search card is the Clásico's (`SearchCard` in `HomeFrame.jsx`).
- Intro (`MatchIntro.jsx`, with the pieces of Inicio and of the search: `diseno.md`, "Before each game"): the top bar has the chip "Clásico" in the logo's look, "Juego 3" (no total) and a segment per game so far; "Juego de desempate" there and on the roulette's card when two are tied at 2. The result of the game before says what it takes to win ("Gana la partida el primero en ganar 2 juegos", or that the next one breaks a tie). The roulette's reel leaves out what was played since the draw started over. End = the playlist's results screen.
- Tests `game/classic.test.js` (private), `game/matchmaking.test.js` (public: duels decided 2–0, 2–1, after a tie at 2, out of games).
