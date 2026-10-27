# Rey de la colina (id `rey`, `REY_GAME`)

The king picks one of three questions; the challengers write. The first right answer takes the crown and ends the round; if nobody gets it the king scores it (`REY_POINTS`: 1, 3, 5 by difficulty). Needs 2 players. Not in playlists or public matches.

- `config.rey`: `rounds` 5–20 in steps of 5 (10), `roundMs` 15–35 s (20), `categories`, `difficulties`. `game/rey.js` (`pickReyRounds`; pool = `rainPool`, at least `REY_MIN_QUESTIONS` 12).
- Each round is drawn with three `offers` (one per ticked difficulty). The first king is random (`room.king`; redrawn if gone).
- **The king's pick is the countdown:** `beginKingPick`, `REY_PICK_MS` (10 s), socket `game:kingPick` (`reyPick`); none → random (also what "Saltar" does).
- **Answers:** `submitAnswer` → `reyAnswer`, one per challenger; the king can't answer and is never waited for (`isPlaying` false). `gradeRey` moves the crown or scores the king.
- `publicState.rey` = `{ kingId, roundKingId, offers, dethronedBy, survived, points }`.
- Tests `game/reyRoom.test.js`. Frontend `modes/rey/`, styles `styles/rey.css` (`--tv-ry-*`, gold).
