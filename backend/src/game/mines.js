import { buildMinesQuestions, MINES_MODE } from "../mines/minesQuestions.js";
import { QUESTION_CATEGORIES, toQuestion } from "../questions/questionSchema.js";

// Campo de minas: its settings (config.mines), how a match draws its boards and how a hit is scored. Each round is a
// prompt ("Países de Europa") and a 5 × 5 board of answers, some right and some mines. The first to pick a cell keeps
// it. A right answer scores; a mine leaves the player out until the next round, with the points they had. The only way
// to play it (`style`) is "carrera", with no turns: everyone picks as many cells as they like, as fast as they can,
// until they step on a mine or the round's time runs out. The round ends when every right answer has been found or
// nobody is left standing. "turnos" (every player still in picks one cell per turn and the turn waits for them all) is
// no longer a way to choose, but it is how a tiebreak is played (pickMinesTiebreak), with `turnMs` as its clock.

export const MINES_GAME = MINES_MODE;
export const MINES_CATEGORIES = Object.keys(QUESTION_CATEGORIES);
// The difficulties a match can mix, any of them ticked (all by default), like Trivia's.
export const MINES_LEVELS = ["facil", "media", "dificil"];
// The ways to play: a race with no turns.
export const MINES_STYLES = ["carrera"];
// Same limits as the settings on screen (frontend/src/modes/minas/minesInfo.js). `turnMs` is the time of each turn of
// a tiebreak and `roundMs` the time of a whole round ("carrera").
export const MINES_LIMITS = {
  rounds: { min: 3, max: 25 },
  turnMs: { min: 5000, max: 25000 },
  roundMs: { min: 30000, max: 50000 },
};
// The reveal stays on screen long enough to see the whole board: the answers nobody found and where the mines were.
export const MINES_REVEAL_MS = 6000;
// Every right answer is worth the same: 100 points.
export const HIT_POINTS = 100;

export function hitPoints() {
  return HIT_POINTS;
}

export function defaultMinesConfig() {
  return {
    styles: [...MINES_STYLES],
    // The shortest of each, like the settings on screen start (3 rounds, 5 s, 30 s).
    rounds: 3,
    turnMs: 5000,
    roundMs: 30000,
    categories: [...MINES_CATEGORIES],
    difficulties: [...MINES_LEVELS],
  };
}

const clamp = (n, { min, max }, fallback) => Math.min(max, Math.max(min, Math.round(Number(n)) || fallback));
const pickList = (change, allowed, fallback) => (Array.isArray(change) ? allowed.filter((v) => change.includes(v)) : fallback);

/**
 * Merges a settings change into the current Campo de minas settings, keeping every value valid. The categories and
 * the difficulties can be left all unticked, like every list of the settings: the match just can't start
 * (RoomManager.start).
 */
export function mergeMinesConfig(current, change = {}) {
  const base = { ...defaultMinesConfig(), ...current };
  return {
    // There is a single way to play now: whatever a room or an older client has ("turnos") becomes the race.
    styles: [...MINES_STYLES],
    rounds: change.rounds != null ? clamp(change.rounds, MINES_LIMITS.rounds, base.rounds) : base.rounds,
    turnMs: change.turnMs != null ? clamp(change.turnMs, MINES_LIMITS.turnMs, base.turnMs) : base.turnMs,
    roundMs: change.roundMs != null ? clamp(change.roundMs, MINES_LIMITS.roundMs, base.roundMs) : base.roundMs,
    categories: pickList(change.categories, MINES_CATEGORIES, base.categories),
    difficulties: pickList(change.difficulties, MINES_LEVELS, base.difficulties),
  };
}

/**
 * The Campo de minas boards of the loaded bank (questions/questionBank.js: Supabase, the private file...). Without
 * any (Supabase not set up yet, or not uploaded) they come from mines/boards/.
 */
export function minesBank(questions = []) {
  const rows = questions.filter((q) => q.mode === MINES_MODE && q.type === "minefield");
  return rows.length ? rows : buildMinesQuestions().map(toQuestion);
}

/** The boards that match the settings. `ignore` leaves one filter out (to count what each chip would add). */
function questionsFor(bank, { categories, difficulties }, ignore = null) {
  return bank.filter(
    (q) =>
      (ignore === "categories" || categories.includes(q.category)) &&
      (ignore === "difficulties" || difficulties.includes(q.difficulty))
  );
}

/** How many boards a match with these settings can draw from (it needs one per round). */
export function countMinesQuestions(bank, config) {
  return questionsFor(bank, mergeMinesConfig(config)).length;
}

/**
 * For the settings' chips: how many boards each category has with the chosen difficulties, and each difficulty with
 * the chosen categories.
 */
export function minesCounts(bank, config) {
  const settings = mergeMinesConfig(config);
  const tally = (ignore, key) => {
    const out = {};
    for (const q of questionsFor(bank, settings, ignore)) out[key(q)] = (out[key(q)] || 0) + 1;
    return out;
  };
  return { categories: tally("categories", (q) => q.category), difficulties: tally("difficulties", (q) => q.difficulty) };
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A board as a round of the room (these objects stay on the server; see RoomManager.publicState): its cells in a
 * random order, each with who picked it (`by`), when and in which turn.
 */
export function toMinesBoard(q) {
  const cells = [
    ...q.data.correct.map((text) => ({ text, correct: true })),
    ...q.data.wrong.map((text) => ({ text, correct: false })),
  ];
  return {
    id: q.id,
    prompt: q.prompt,
    category: q.category,
    difficulty: q.difficulty,
    cells: shuffle(cells).map((c) => ({ ...c, by: null, at: null, turn: null })),
  };
}

/**
 * The boards of a match: the chosen categories share the rounds as evenly as they can (5 rounds of three categories =
 * 2 + 2 + 1), in random order. Each board gets the way it's played (`style`).
 */
export function pickMinesQuestions(bank, config) {
  const settings = mergeMinesConfig(config);
  const pools = shuffle(settings.categories).map((category) => shuffle(questionsFor(bank, { ...settings, categories: [category] })));
  const picked = [];
  while (picked.length < settings.rounds && pools.some((p) => p.length)) {
    for (const pool of pools) {
      if (picked.length >= settings.rounds) break;
      if (pool.length) picked.push(pool.pop());
    }
  }
  return shuffle(picked).map((q) => ({ ...toMinesBoard(q), style: MINES_STYLES[0] }));
}

// A tiebreak board always has this many mines, whatever the number of tied players.
export const TIEBREAK_MINES = 2;

/**
 * The board of a tiebreak between `players` tied players: a board not played in the match (with the match's settings
 * when there is one left), cut down to one cell more than players: one right answer fewer than players and
 * TIEBREAK_MINES mines (2 players: 1 right and 2 mines; 3 players: 2 right and 2 mines). So not every tied player can
 * find a right answer, and at least one falls. Always played by turns.
 */
export function pickMinesTiebreak(bank, config, playedIds = [], players = 2) {
  const settings = mergeMinesConfig(config);
  const fresh = (list) => list.filter((q) => !playedIds.includes(q.id));
  const pool = [fresh(questionsFor(bank, settings)), fresh(bank), bank].find((list) => list.length);
  if (!pool) return null;
  const q = pool[Math.floor(Math.random() * pool.length)];
  const data = {
    correct: shuffle(q.data.correct).slice(0, Math.max(1, players - 1)),
    wrong: shuffle(q.data.wrong).slice(0, TIEBREAK_MINES),
  };
  return { ...toMinesBoard({ ...q, data }), style: "turnos", tiebreak: true };
}
