# Rango (id `historia`, `HISTORY_GAME`)

Get as close as possible on a range. The id, route, files and `config.history` keep the old "historia" name on purpose.

- **Only Cifras** (a number on a bar): `config.history.styles` is always `["cifras"]` (`mergeHistoryConfig` ignores what a room or an older client sends, `linea` included) and the settings show no "Modos de juego". **Línea del tiempo** (an event's year on a timeline) was removed as a mode: its events, `yearRange`, `yearPoints` and the timeline screens stay in the code, but `questionsFor` only takes the `number` rows, so a category fills only as many rounds as it has figures with different answers.
- `config.history`: `rounds` 5–25, `roundMs` 10–30 s, `categories`, `difficulties`; an empty list blocks the start. `game/history.js` (`pickHistoryQuestions`: categories share the rounds, never two events of the same year). Ages (`eraOf`) only set the timeline's length and how fast points fall.
- **Events:** `history/events.js` (`[year, difficulty, text, topic]`; the text never gives the year away; every category has ≥30 events of different years, checked by `history.test.js`) → `historyQuestions.js` (type `year`). **Figures:** `history/figures.js` (`[answer, difficulty, text, topic, unit]`, a whole number > 0 that can't stop being true) → `figureQuestions.js` (type `number`). `history:upload` uploads both; `historyBank()` = the lists + other Supabase `historia` rows, the lists winning.
- **Timeline:** `yearRange()` per match (span by age in `TIMELINES`, the year strictly inside). Year 0 doesn't exist (`yearsApart()` counts −1→1 as one); future years show striped and are refused.
- **Bar (cifras):** `figureRange()` (round span, answer away from the ends), steps of `snap`; exact within `figureTolerance`.
- **Answers:** socket `game:year` `{ year | value, lock }` (`placeYear`), movable until locked. `gradeYears()`: exact 1000 (a hit); otherwise `nearPoints`, 900 down to 0 at 60 % of the range.
- **Tiebreak:** like Encuentra el país's, with an unused event; the first exact confirm wins, else the closest.
- **Frontend** `modes/historia/` (`Game.jsx`, `Timeline.jsx`, `HistorySettings.jsx`, `historyInfo.js`), styles `styles/history.css` (`--tv-hm-*`).
