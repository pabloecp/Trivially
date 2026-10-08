import { buildMinesQuestions, MINES_MODE } from "../mines/minesQuestions.js";
import { QUESTION_CATEGORIES, toQuestion } from "../questions/questionSchema.js";

// Campo de minas: its settings (config.mines), how a match draws its boards and how a hit is scored. Each round is a
// prompt ("Países de Europa") and a 5 × 5 board of answers, some right and some mines. The first to pick a cell keeps
// it. A right answer scores; a mine leaves the player out until the next round, with the points they had. Two ways to
// play it (`style`): "turnos", where every player still in picks one cell per turn and the turn waits for them all,
// and "carrera", with no turns: everyone picks as many cells as they like, as fast as they can, until they step on a
// mine or the round's time runs out. Any of them can be ticked (`styles`, both by default): each round is played in one
// of the ticked ways, shared as evenly as the rounds allow. The round ends when every right answer has been found or nobody is left standing.

export const MINES_GAME = MINES_MODE;
export const MINES_CATEGORIES = Object.keys(QUESTION_CATEGORIES);
// The difficulties a match can mix, any of them ticked (all by default), like Trivia's.
export const MINES_LEVELS = ["facil", "media", "dificil"];
// The ways to play: one cell per turn, or a race with no turns.
export const MINES_STYLES = ["turnos", "carrera"];
// Same limits as the settings on screen (frontend/src/modes/minas/minesInfo.js). `turnMs` is the time of each turn
// ("turnos") and `roundMs` the time of a whole round ("carrera").
export const MINES_LIMITS = {
  rounds: { min: 3, max: 10 },
  turnMs: { min: 5000, max: 20000 },
  roundMs: { min: 30000, max: 90000 },
};
// The first turn of a round lasts this much longer: it's when the 25 cells are read for the first time.
export const MINES_FIRST_TURN_EXTRA_MS = 5000;
// The reveal stays on screen long enough to see the whole board: the answers nobody found and where the mines were.
export const MINES_REVEAL_MS = 6000;
// The first hit of a round is worth 100 points, and each next one 100 more, up to 500.
const HIT_STEP = 100;
const HIT_MAX = 500;

export function hitPoints(nth) {
  return Math.min(HIT_MAX, HIT_STEP * nth);
}

export function defaultMinesConfig() {
  return {
    styles: [...MINES_STYLES],
    rounds: 5,
    turnMs: 10000,
    roundMs: 45000,
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
  // Rooms (and clients) from before could only choose one way: `style`.
  if (!Array.isArray(current?.styles) && MINES_STYLES.includes(current?.style)) base.styles = [current.style];
  const oneStyle = MINES_STYLES.includes(change.style) ? [change.style] : base.styles;
  return {
    styles: pickList(change.styles, MINES_STYLES, oneStyle),
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
 * 2 + 2 + 1), in random order. Each board gets the way it's played (`style`), the ticked ones shared the same way.
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
  const styles = settings.styles.length ? settings.styles : [MINES_STYLES[0]];
  const roundStyles = shuffle(picked.map((_, i) => styles[i % styles.length]));
  return shuffle(picked).map((q, i) => ({ ...toMinesBoard(q), style: roundStyles[i] }));
}
