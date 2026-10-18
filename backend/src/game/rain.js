import { QUESTION_CATEGORIES } from "../questions/questionSchema.js";
import { sameQuestion, toQuizTrack } from "./quiz.js";

// Lluvia: its settings (config.rain), how a match draws its questions and what each one is worth. Each round is a
// shower: for `roundMs` the questions fall from the top of the screen to the bottom (every player sees the same ones
// at the same moment), and each player writes answers in the box under them. An answer counts for any question still
// on screen: the first player to answer a question takes it, it scores its difficulty's points for them (fácil 1,
// media 3, difícil 5) and leaves everyone's screen, so nobody else can answer it. Whoever has the most points when
// the time runs out wins the round; the match adds up every round.
// The questions are Trivia's written ones (each four-option question written too, and the capitals), without flags.

export const RAIN_GAME = "lluvia";
export const RAIN_CATEGORIES = Object.keys(QUESTION_CATEGORIES);
// The difficulties a match can mix, any of them ticked (all by default), and what a question of each is worth.
export const RAIN_LEVELS = ["facil", "media", "dificil"];
export const RAIN_POINTS = { facil: 1, media: 3, dificil: 5 };
// Same limits as the settings on screen (frontend/src/modes/lluvia/rainInfo.js).
export const RAIN_LIMITS = {
  rounds: { min: 1, max: 5 },
  roundMs: { min: 30000, max: 90000 },
};
// How long a question takes to cross the screen, from the top edge to the bottom one.
export const RAIN_FALL_MS = 13000;
// A question goes out to the players this long before it shows, so it's there in time (the room is sent about once a
// second); it can still be answered this long after it left, for the network's delay.
export const RAIN_LEAD_MS = 2000;
export const RAIN_GRACE_MS = 600;
// The reveal stays a little longer than other games': the round's winner and the answers of what was still falling.
export const RAIN_REVEAL_MS = 5000;
// A match needs at least this many different questions (a round with fewer repeats them once they left the screen).
export const RAIN_MIN_QUESTIONS = 10;
// A player can send an answer this often.
export const RAIN_ANSWER_GAP_MS = 120;
// The rain gets heavier along the round: a question every 1.7 s at its start, every 1.15 s at its end (give or take
// 15%), so about nine are falling at once. The first one falls straight away, and none starts in the last 3 s.
const GAP_START_MS = 1700;
const GAP_END_MS = 1150;
const GAP_JITTER = 0.15;
const FIRST_DROP_MS = 400;
const LAST_DROP_MS = 3000;
// Where a question falls: one of three columns side by side (0 the left one, 0.5 the middle, 1 the right one), each a
// third of the screen wide, so two columns never overlap. A column takes a new question only once the one before has
// fallen this far (a quarter of the screen), so they never overlap within it either: when no column is free, the next
// question waits for one.
export const RAIN_COLUMNS = [0, 0.5, 1];
export const RAIN_COLUMN_GAP_MS = 3400;

export function defaultRainConfig() {
  return { rounds: 3, roundMs: 60000, categories: [...RAIN_CATEGORIES], difficulties: [...RAIN_LEVELS] };
}

const clamp = (n, { min, max }, fallback) => Math.min(max, Math.max(min, Math.round(Number(n)) || fallback));
const pickList = (change, allowed, fallback) => (Array.isArray(change) ? allowed.filter((v) => change.includes(v)) : fallback);

/**
 * Merges a settings change into the current Lluvia settings, keeping every value valid. The categories and the
 * difficulties can be left all unticked, like every list of the settings: the match just can't start.
 */
export function mergeRainConfig(current, change = {}) {
  const base = { ...defaultRainConfig(), ...current };
  return {
    rounds: change.rounds != null ? clamp(change.rounds, RAIN_LIMITS.rounds, base.rounds) : base.rounds,
    roundMs: change.roundMs != null ? clamp(change.roundMs, RAIN_LIMITS.roundMs, base.roundMs) : base.roundMs,
    categories: pickList(change.categories, RAIN_CATEGORIES, base.categories),
    difficulties: pickList(change.difficulties, RAIN_LEVELS, base.difficulties),
  };
}

/** The questions Lluvia can ask: Trivia's written ones (game/quiz.js quizPool), but not the flags (they're images). */
export function rainPool(quizQuestions = []) {
  return quizQuestions.filter((q) => q.type === "open" && q.data?.kind !== "flag");
}

/** The questions that match the settings. `ignore` leaves one filter out (to count what each chip would add). */
function questionsFor(pool, config, ignore = null) {
  const { categories, difficulties } = mergeRainConfig(config);
  return pool.filter(
    (q) => (ignore === "categories" || categories.includes(q.category)) && (ignore === "difficulties" || difficulties.includes(q.difficulty))
  );
}

/** How many different questions a match with these settings can draw from. */
export function countRainQuestions(pool, config) {
  return new Set(questionsFor(pool, config).map(sameQuestion)).size;
}

/** For the settings' chips: how many questions each category and difficulty has with the other settings. */
export function rainCounts(pool, config) {
  const tally = (ignore, key) => {
    const out = {};
    for (const q of questionsFor(pool, config, ignore)) out[key(q)] = (out[key(q)] || 0) + 1;
    return out;
  };
  return { categories: tally("categories", (q) => q.category), difficulties: tally("difficulties", (q) => q.difficulty) };
}

function shuffle(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * When and where each question of a round falls: `at` (ms from the round's start), more and more often, and `lane`,
 * a column free by then (never the one the question before fell in, while another one is free).
 */
export function rainSchedule(roundMs, random = Math.random) {
  const out = [];
  const lastAt = RAIN_COLUMNS.map(() => -Infinity);
  let lastColumn = null;
  for (let at = FIRST_DROP_MS; at <= roundMs - LAST_DROP_MS; ) {
    let free = RAIN_COLUMNS.map((_, i) => i).filter((i) => at - lastAt[i] >= RAIN_COLUMN_GAP_MS);
    if (!free.length) {
      at = Math.min(...lastAt) + RAIN_COLUMN_GAP_MS;
      continue;
    }
    if (free.length > 1) free = free.filter((i) => i !== lastColumn);
    const column = free[Math.floor(random() * free.length)];
    out.push({ at: Math.round(at), lane: RAIN_COLUMNS[column] });
    lastAt[column] = at;
    lastColumn = column;
    const gap = GAP_START_MS + (GAP_END_MS - GAP_START_MS) * (at / roundMs);
    at += gap * (1 - GAP_JITTER + 2 * GAP_JITTER * random());
  }
  return out;
}

// One difficulty's questions in the order they come out: a question of each category in turn, so a big category
// (geography has every capital) doesn't fill the sky.
function deckFor(questions, random) {
  const byCategory = new Map();
  for (const q of questions) byCategory.set(q.category, [...(byCategory.get(q.category) || []), q]);
  const lists = shuffle([...byCategory.values()], random).map((l) => shuffle(l, random));
  const deck = [];
  for (let i = 0; lists.some((l) => i < l.length); i += 1) deck.push(...shuffle(lists.filter((l) => i < l.length).map((l) => l[i]), random));
  return deck;
}

/**
 * The rounds of a match, each with its questions ("drops"): when each starts falling (`at`, ms from the round's start),
 * in which column (`lane`, rainSchedule), what it's worth and the question itself (a Trivia track: text, answer, aliases, reject). The ticked
 * difficulties take turns, so with all three a third of the rain is of each; within one, the categories take turns.
 * A match doesn't repeat a question while it has others; with few of them, a round asks one again once it left the
 * screen. These objects stay on the server (see RoomManager.publicRainQuestion).
 */
export function pickRainRounds(pool, config, random = Math.random) {
  const settings = mergeRainConfig(config);
  const matching = questionsFor(pool, settings);
  const levels = settings.difficulties.filter((level) => matching.some((q) => q.difficulty === level));
  const decks = new Map(levels.map((level) => [level, deckFor(matching.filter((q) => q.difficulty === level), random)]));
  const used = new Set();
  const rounds = [];
  if (!levels.length) return rounds;
  for (let r = 0; r < settings.rounds; r += 1) {
    // When each question last started falling in this round.
    const fellAt = new Map();
    const drops = [];
    let order = [];
    for (const { at, lane } of rainSchedule(settings.roundMs, random)) {
      if (!order.length) order = shuffle(levels, random);
      const first = order.shift();
      let question = null;
      for (const level of [first, ...levels.filter((l) => l !== first)]) {
        const deck = decks.get(level);
        // Not asked yet in the match; else not yet in this round; else gone from the screen.
        question =
          deck.find((q) => !used.has(sameQuestion(q))) ||
          deck.find((q) => !fellAt.has(sameQuestion(q))) ||
          deck.find((q) => at - fellAt.get(sameQuestion(q)) > RAIN_FALL_MS + RAIN_GRACE_MS);
        if (question) break;
      }
      if (!question) continue;
      const key = sameQuestion(question);
      used.add(key);
      fellAt.set(key, at);
      drops.push({ id: drops.length, at, lane, points: RAIN_POINTS[question.difficulty] || 1, question: toQuizTrack(question) });
    }
    rounds.push({ id: `lluvia-${r + 1}`, kind: "rain", roundMs: settings.roundMs, fallMs: RAIN_FALL_MS, drops });
  }
  return rounds;
}

/** "Sin aciertos", "1 acierto · 3 puntos", "4 aciertos · 12 puntos". */
export function rainRoundText(hits, points) {
  if (!hits) return "Sin aciertos";
  return `${hits} ${hits === 1 ? "acierto" : "aciertos"} · ${points} ${points === 1 ? "punto" : "puntos"}`;
}
