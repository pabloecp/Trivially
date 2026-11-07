// How each question does when it's played: at every reveal (RoomManager.beginReveal) the round becomes one entry per
// question (Lluvia: one per question that fell), counted by db/questionStats.js into the table `question_stats`. Only
// people count: never bots, spectators, players out of the match, Rey de la colina's king (who doesn't answer) or a
// tiebreak (a different round, with no points). Nothing is decided with this yet: it's kept so that, with enough
// matches, a question's difficulty can be checked against how often it's really got right.
//
// An entry: { game, questionId, variant, prompt, difficulty, category, seen, players, correct, wrong, skipped, blank,
//   points, correctMs, extra }
//   - seen: times it was played (1 a round); players: people who had it in front of them;
//   - correct / wrong / skipped ("Saltar") / blank (time ran out with nothing sent): what each of them did;
//   - points: the points it gave; correctMs: the milliseconds the right answers took, added up (÷ correct = average);
//   - extra: what only that game has (all numbers, added up row by row): see each game below.
// `variant` keeps apart the ways of playing one question that aren't comparable: Trivia's "opciones" / "escribir",
// Adivina la canción's "titulo:opciones" … "letra:escribir", Encuentra el país' style, Rango's kind, Campo de minas'.

// How many different wrong answers (or options) an entry keeps by name, so a row can't grow without end.
export const MAX_NAMED = 15;

const name = (text) => String(text ?? "").trim().toLowerCase().slice(0, 60);

/** Adds `n` to extra[group][key] while the group has room for it (a new key past MAX_NAMED goes to "otras"). */
function tally(extra, group, key, n = 1) {
  if (!key) return;
  const bag = (extra[group] ||= {});
  const k = key in bag || Object.keys(bag).length < MAX_NAMED ? key : "otras";
  bag[k] = (bag[k] || 0) + n;
}

function entry(game, questionId, variant, track, prompt) {
  return {
    game,
    questionId: String(questionId),
    variant: variant || "",
    prompt: prompt ? String(prompt).slice(0, 300) : null,
    difficulty: track?.difficulty || null,
    category: track?.category || null,
    seen: 1,
    players: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
    blank: 0,
    points: 0,
    correctMs: 0,
    extra: {},
  };
}

/** What one player did with a round that has a single answer: "correct", "wrong", "skipped" or "blank". */
export function outcomeOf(answer) {
  if (!answer) return "blank";
  if (answer.skipped || answer.gaveUp) return "skipped";
  if (answer.correct) return "correct";
  const sent = (answer.text && String(answer.text).trim()) || Number.isInteger(answer.choice) || answer.pin || Number.isInteger(answer.year) || Number.isInteger(answer.value);
  return sent ? "wrong" : "blank";
}

function count(e, player, answer, startedAt) {
  const outcome = outcomeOf(answer);
  e.players += 1;
  e[outcome] += 1;
  e.points += player.lastPoints || 0;
  if (outcome === "correct" && answer?.at && startedAt) e.correctMs += Math.max(0, answer.at - startedAt);
  return outcome;
}

/** The people who played this round (see the top of the file). */
function people(manager, room) {
  return [...room.players.values()].filter((p) => !p.bot && manager.isPlaying(room, p.id));
}

/** The id that Trivia's questions keep in every game: the written version of a question counts as the same one. */
const baseId = (q) => q?.baseId || String(q?.id ?? "").replace(/:escribir$/, "");

/**
 * The round's entries (an empty list when nothing should be counted). Called at the reveal, after the answers are
 * graded and before the reveal's clock starts (room.phaseStartedAt is still when the answering started).
 */
export function roundStats(manager, room, track) {
  if (!track || room.tiebreak) return [];
  const startedAt = room.phaseStartedAt;
  const game = room.game;

  // An owner skipped it ("Saltar pregunta"): usually because something was wrong with it. Only that is said.
  if (track.ownerSkipped && game !== "lluvia") {
    const e = questionKey(room, track);
    if (!e) return [];
    e.extra.ownerSkips = 1;
    return [e];
  }

  if (game === "lluvia") return rainStats(manager, room, track);
  if (game === "minas") return minesStats(manager, room, track);
  if (game === "farsante") return farsanteStats(manager, room, track);

  const e = questionKey(room, track);
  if (!e) return [];
  for (const player of people(manager, room)) {
    const answer = player.lastAnswer;
    const outcome = count(e, player, answer, startedAt);
    if (outcome !== "wrong") continue;
    if (game === "mundo") {
      // How far the pins outside the country landed, added up (÷ wrong = average km).
      e.extra.wrongKm = (e.extra.wrongKm || 0) + Math.round(answer.distanceKm || 0);
    } else if (game === "historia") {
      // How far off: years (Línea del tiempo) or, for Cifras, the error over the bar's span, in thousandths; and
      // whether people go over or fall short.
      const off = track.kind === "cifras" ? Math.round(((answer.diff || 0) / (track.span || 1)) * 1000) : answer.diff || 0;
      e.extra.wrongOff = (e.extra.wrongOff || 0) + off;
      tally(e.extra, "direction", track.kind === "cifras" ? (answer.over ? "arriba" : "abajo") : answer.year > track.year ? "despues" : "antes");
    } else {
      // Which wrong option was picked, or what was written (to spot a right answer the question doesn't take yet).
      tally(e.extra, Number.isInteger(answer.choice) ? "picked" : "written", name(answer.text));
    }
  }
  // Rey de la colina: a challenger answered right first, took the crown and the round ended there (those who hadn't
  // answered yet count as "blank").
  if (game === "rey" && track.dethronedBy) e.extra.dethroned = 1;
  return [e];
}

/** The entry (with no players yet) of a round of one of the games with one question a round. */
export function questionKey(room, track) {
  const game = room.game;
  if (game === "opciones" || game === "rey") {
    const variant = track.type === "choice" ? "opciones" : "escribir";
    return entry(game, baseId(track), variant, track, track.text || track.prompt);
  }
  if (game === "musica") {
    const style = track.lyric ? "letra" : "titulo";
    const format = track.type === "choice" ? "opciones" : "escribir";
    const label = [track.title, track.artistName].filter(Boolean).join(" - ");
    return entry(game, track.lyric?.id || track.id, `${style}:${format}`, track, track.lyric ? `${track.lyric.line} (${label})` : label);
  }
  if (game === "mundo") return entry(game, track.id, track.style || "", track, track.prompt || track.name);
  if (game === "historia") return entry(game, track.id, track.kind || "", track, track.text || track.prompt);
  if (game === "minas") return entry(game, track.id, track.style || "", track, track.prompt);
  if (game === "farsante") return track.kind === "dato" && track.question ? entry(game, baseId(track.question), "dato", track.question, track.text) : null;
  return track.id != null ? entry(game, track.id, "", track, track.prompt || track.text) : null;
}

/**
 * Campo de minas: a board. Each person's board is "correct" when they ended it without a mine (it ran out of right
 * cells, or they stopped), "wrong" when they stepped on one, "blank" when they picked nothing. extra: `hits` (right
 * cells found, added up), and `cells`, each cell's text with how many times it was picked (`ok:` right ones, `mina:`
 * mines): right cells nobody finds and mines that fool many say how hard the board really is.
 */
function minesStats(manager, room, board) {
  const e = questionKey(room, board);
  const humans = new Set();
  for (const player of people(manager, room)) {
    const field = player.minefield;
    if (!field) continue;
    humans.add(player.id);
    e.players += 1;
    e.points += field.points || 0;
    e.extra.hits = (e.extra.hits || 0) + (field.hits || 0);
    const picked = board.cells.some((c) => c.by === player.id);
    if (!picked) e.blank += 1;
    else if (field.out === "mina") e.wrong += 1;
    else e.correct += 1;
  }
  for (const cell of board.cells) {
    if (!cell.by || !humans.has(cell.by)) continue;
    const key = `${cell.correct ? "ok" : "mina"}:${name(cell.text)}`;
    e.extra.cells ||= {};
    e.extra.cells[key] = (e.extra.cells[key] || 0) + 1;
  }
  return e.players ? [e] : [];
}

/**
 * Lluvia: one entry per question that fell (game "lluvia", the Trivia question's id). Answers aren't tied to a question
 * when they're wrong, so each one says only whether someone took it ("correct", with how long it took from when it
 * started falling) or it fell with nobody getting it ("blank"); `players` is how many people had it on their screen.
 */
function rainStats(manager, room, round) {
  const playing = people(manager, room).filter((p) => p.rain);
  if (!playing.length) return [];
  const ids = new Set(playing.map((p) => p.id));
  const out = [];
  for (const drop of round.drops || []) {
    if (drop.at >= round.roundMs) continue;
    const q = drop.question;
    const e = entry("lluvia", baseId(q), "", q, q.text || q.prompt);
    e.players = playing.length;
    if (drop.by && ids.has(drop.by)) {
      e.correct = 1;
      e.points = drop.points || 0;
      if (Number.isFinite(drop.takenAt)) e.correctMs = Math.max(0, drop.takenAt - drop.at);
    } else if (drop.by) {
      // Taken by a bot: it fell, but it says nothing about people.
      e.players = 0;
      e.extra.byBot = 1;
    } else {
      e.blank = 1;
    }
    out.push(e);
  }
  return out;
}

/**
 * Farsante: only "dato raro" rounds (a real Trivia question among invented answers). Voting the real answer is
 * "correct", voting an invented one "wrong", not voting "blank". extra.wroteTruth: people who wrote the real answer
 * themselves (they knew it).
 */
function farsanteStats(manager, room, round) {
  const e = questionKey(room, round);
  if (!e) return [];
  for (const player of people(manager, room)) {
    e.players += 1;
    const index = round.votes?.[player.id];
    const option = Number.isInteger(index) ? round.options?.[index] : null;
    if (!option) e.blank += 1;
    else if (option.author === null) e.correct += 1;
    else e.wrong += 1;
    e.points += player.lastPoints || 0;
    if (round.entries?.[player.id] && round.truth && name(round.entries[player.id]) === name(round.truth)) {
      e.extra.wroteTruth = (e.extra.wroteTruth || 0) + 1;
    }
  }
  return e.players ? [e] : [];
}
