# Rooms and the game loop (backend), Trivia and Adivina la canción

## Rooms
- `game/roomManager.js` keeps every room in memory: a `Map` by code plus `socketToRoom` (socket id → `{code, userId}`). Nothing is persisted.
- A room outlives its games: on screen it's "tu grupo". `room.game` is a `GAME_IDS` id (`null` only in an older room: the frame then shows "Elige un juego"). Only the host changes it (`setGame`, socket `room:setGame`, from "¿Qué quieren jugar?"), which abandons the match (`resetMatch`). `room.audience` ("grupo" | "publica") is who its next match is for (see `partidas-publicas.md`).
- The room's screen while it waits is the frame of Inicio (`HomeFrame.jsx`): the game's own lobby (`modes/*/LobbyPanel.jsx`: `ModeStage` + `SettingsPanel`) over the group's bar (`GroupBar.jsx`), which has the start button (EMPEZAR, `useStartGame`). The settings hide behind a summary under the card ("5 rondas · 15 s · Todas las categorías", the tabs' notes) and open in "Ajustes de Trivia" (`SettingsPanel` → `Modal.jsx`), every tab's part one after another (`SettingsTabs` stacked), with "Restablecer" (`room:config { reset: game }`, off while `settingsChanged` is false) and "Listo". The playlist keeps its settings beside its card (`SettingsPanel inline`). The room's column (`PartyPanel`) is in "Tu grupo" (`GroupSheet.jsx`) while it waits, and beside the intro and the matches.
- "Volver" in the group's room asks and leaves the group (to Inicio); a game's "Terminar" and the host's X in a match go back to the group's room in the same game (`room:restart`, `restartGame`), not to a menu.
- `leave()` removes a player at once; `disconnect()` keeps the seat and host role `RECONNECT_GRACE_MS` (20 s), and `addPlayer()` with the same user id reclaims it. The room dies when the last connected player goes.
- Host handover: `PlayerMenu.jsx` "Hacer anfitrión" (two taps) → `room:giveHost` / `giveHost`; the old host becomes a co-host (`transferHost`).

## Phases
- `lobby → countdown (3 s) → playing (config.roundMs) → reveal → next countdown … → finished`. The reveal is 3 s (`REVEAL_MS`) except Campo de minas (`MINES_REVEAL_MS`, 6 s), Lluvia (`RAIN_REVEAL_MS`, 5 s), Rey (4 s) and Farsante (8 s).
- `setPhase()` owns the single `room.timer`; every transition calls `rooms.onPhaseChange`, which `sockets.js` wires to broadcast `room:state`; `watchRoom()` re-broadcasts about once a second during a match.
- "Volver a jugar" = `room:replay` (same game and settings); "Volver al lobby" = `room:restart`.
- **Pause** (`room:pause`, `pause`/`resume`, `canPause`: the host, or a verified owner in any match): `room.paused.remainingMs` freezes the time, `assertNotSpectator` refuses answers, resuming restarts `room.phaseOnEnd` and shifts `phaseStartedAt`. UI: `PauseButton`/`PauseVeil` in `components/home/PauseControls.jsx`.
- **Report** (`ReportButton`, `room:report`, `questionReport`): once per round per player; saved by `db/reports.js` to Supabase `question_reports`, else `backend/private/question-reports.jsonl`.
- **Skip** (owners, `SkipButton`, `room:skipRound`, `skipRound`): grades the round, skips its reveal and the next countdown.

## publicState
`publicState(room, forUserId)` is the only serializer. Answers, picks and the track's metadata are hidden until `reveal` (during playing only `audio.previewUrl`). The `me` block only goes in ack responses (`forUserId`), not broadcasts.

## Answers and scoring
- `game:answer` takes a track id or free text (`isCorrectAnswer` in `game/answers.js`: accents, parentheticals, Levenshtein, substrings).
- `game/scoring.js`: a right answer 500 + up to 500 for speed; closeness rounds 1000 exact, less when near (`locationPoints`, `yearPoints`, `figurePoints`). Streaks are stats only.
- **Inactive:** `markIdle` counts rounds without an answer (`idleRounds`); after `IDLE_ROUNDS` (3) the player is `idle`: not waited for, "Inactivo" on the board. Any answer resets it.
- **Spectators:** joining mid-match sets `player.spectator`: they see rounds, can't answer (`assertNotSpectator`), are never waited for (`isPlaying`), and are out of ranking, stats and tiebreaks. `resetMatch()` clears it.

## After a match
- `applyMatchStats` writes per-user stats; `matchWinner`: first place with points, a tie counts for nobody unless a tiebreak settled it.
- History: `user.history` (newest first, `MATCH_HISTORY_LIMIT` 10). Question ids never go out: `publicHistory`, `sanitizeUser` (own account, with rounds), `sanitizeUserPublic` (never rounds), `publicRounds`. UI: `MatchHistory.jsx`, `MatchSummarySheet`.
- Summary: `recordRound` fills `player.rounds` (`{ round, game, prompt, answer, yours, points, status }`, status `ok|near|bad|none`), sent as `results[].rounds`.
- Results screens share `components/home/ResultsParts.jsx` (`PodiumCard`, `RetouchCard` from `ResultsLooks.jsx`, `GamesWon`). One column below 720 px. On phones the buttons go in `ResultsFoot`, a bar pinned to the bottom like `.tv-roomdock` (portal into `.tv-app`; the way back is a square with its icon), and the podium shows only first names (`.tv-podium-first`).
- Phones: during an intro (`.tv-mcard`) the scoreboard stays under the card (home.css, "Phones: the room's bars").

## Room extras
- **Chat** (`RoomChat.jsx` in `PartyPanel`, `room:chat`, `sendChat`): `room.chat`, newest 40, ≤200 chars, one per 0.7 s per player. On phones, a sheet.
- **Hidden code** (`lib/hiddenCode.js`, key `trivially_hide_code`): dots on this device, and the URL uses `HIDDEN_SLUG` "oculta" instead of the code (`urlCode`, `resolveCode`, `RoomNavigator`).

## Trivia (`opciones`, `QUIZ_GAME`)
- `config.quiz`: `rounds` 5–20, `roundMs` 15–35 s, and the ticked lists `categories`, `formats` (`opciones|escribir`) and `difficulties`; an empty list blocks the start.
- `game/quiz.js` `quizPool()`: bank `multiple_choice` and `open` rows, plus the capitals and flags of `geoBank()`. Every four-option question is also a written one (`asWritten`: id `<id>:escribir`, `data.aliases`, the other options in `reject`); questions needing the options ("¿Cuál de los siguientes…?") are left out, and a match never draws both versions (`sameQuestion`).
- `pickQuizQuestions` shares the rounds between kinds; `choice` answers are recorded by `submitQuizAnswer` and graded together by `gradeQuiz()` at the reveal; `open` ones go through `isCorrectOpenAnswer` (`isChoiceRound`).
- `publicQuestion()` never sends the id; options and flag from `playing`, answer and `picks` at `reveal`. The lobby gets `questionCounts`.
- Frontend `src/modes/quiz/` (`/quiz/:code`), styles `styles/quiz.css`.

## Adivina la canción (`musica`)
- `config.formats` `opciones|escribir` (`MUSIC_FORMATS`). `pickAhead` + `withFormat()` give each round a way: open (search box) or `choice` (four "Título - Artista" songs, by the same artist when possible; `artistsOf` splits artists but keeps `ONE_ARTIST` acts whole).
- Closed rounds use Trivia's `isChoiceRound`/`submitQuizAnswer`/`gradeQuiz`. Autocomplete list: `GET /api/songs` (`globalSongList()`), plus `searchCatalog` with the room's extras during `playing`.
- Frontend `modes/music/Game.jsx`.
