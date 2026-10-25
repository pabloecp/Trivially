# Clásico (Normal and Extendido, ids `clasico` and `extendido`)

At the top of a private room's "Elige el juego": **Normal** (3 games, 15 rounds) and **Extendido** (5 games, 25 rounds). A public match for the room's own players: same roulette, variants, clocks and games-won rule, but with the room's host, no search, no bots, no rank and no decider.

- In `GAME_IDS` but not games (`kind: "classic"`, hidden by `isGameTile`). `CLASSIC_GAMES`/`CLASSIC_NAMES`/`isClassic` in `matchmaking.js`.
- `start()` → `startClassic` → `drawMatchItems` (shared with `startMatch`), run with `run.classic` (the room's own playlist is untouched). `endRun`, `stopPlaylist` and `setGame` return to the Clásico.
- Lobby `modes/clasico/LobbyPanel.jsx`; end = the playlist's results screen. Tests `game/classic.test.js`.
