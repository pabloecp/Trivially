# Farsante (id `farsante`, `FARSANTE_GAME`)

A party game for a call: everyone writes an answer, then votes for one (never their own), then the reveal shows who wrote and voted what. Needs `FARSANTE_MIN_PLAYERS` (3). Not in playlists or public matches.

- Kinds (`config.farsante.kinds`): **dato** (a real hard question from `datoPool`; voting the real answer scores 1000, each vote on yours scores you 500), and **pelicula**, **frase**, **noticia** (humour, from `farsante/content.js`; 500 per vote). `rounds` 4–12 (8), `writeMs` 30/45/60 s (45).
- All stages are inside `playing`: `round.stage` `"writing"` (`writeMs`) → `beginVoting` (`FARSANTE_VOTE_MS` 25 s, options shuffled once) → reveal (`FARSANTE_REVEAL_MS` 8 s). Sockets `game:farsante` and `game:farsanteVote`. Answers ≤ `FARSANTE_MAX_CHARS` (60), no links, not the real answer, not equal to another (`sameText`). Fewer than two options → straight to the reveal.
- `publicState.farsante`: options without authors until the reveal.
- **Test bots** (owners, private lobby, `room:addTestBot`, up to `FARSANTE_TEST_BOTS` 5): the public matches' bots (`addBot`, `botMove`); the `bot` flag is never sent.
- Tests `game/farsanteRoom.test.js`. Frontend `modes/farsante/`, styles `styles/farsante.css` (`--tv-fs-*`, green).
