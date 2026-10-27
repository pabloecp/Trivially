import { buildFigureQuestions } from "../history/figureQuestions.js";
import { buildHistoryQuestions, HISTORY_MODE } from "../history/historyQuestions.js";
import { QUESTION_CATEGORIES, toQuestion } from "../questions/questionSchema.js";

// Rango (game id "historia", the old one on purpose): its settings (config.history), how a match draws its events, the
// range each one is shown with and how an answer is scored. Its only way of playing (`config.history.styles`) is
// "cifras" (a question whose answer is a number, chosen on a bar). The exact answer gets every point, and the closer
// a guess lands, the more it gets. "linea" (Línea del tiempo: players choose an event's year on a timeline) is no
// longer a way to choose, but its events and timelines are still here (toHistoryTrack, yearRange).

export const HISTORY_GAME = HISTORY_MODE;
export const HISTORY_LEVELS = ["facil", "media", "dificil"];
// Its ways of playing, and the type of question each one plays.
export const HISTORY_STYLES = ["cifras"];
const styleOf = (q) => (q.type === "number" ? "cifras" : "linea");
// The topics of the events (the ids of QUESTION_CATEGORIES, the same "Categorías" as Trivia).
const TOPICS = Object.keys(QUESTION_CATEGORIES);
// Same limits as the settings on screen (frontend/src/modes/historia/historyInfo.js).
export const HISTORY_LIMITS = {
  rounds: { min: 5, max: 25 },
  roundMs: { min: 10000, max: 30000 },
};
// The reveal waits the same as every mode's (game/scoring.js).
export { REVEAL_MS as HISTORY_REVEAL_MS } from "./scoring.js";
// The timeline of each age: how many years it covers, and the round number its ends fall on.
const TIMELINES = {
  antigua: { span: 1500, round: 100 },
  media: { span: 750, round: 50 },
  moderna: { span: 300, round: 20 },
  contemporanea: { span: 150, round: 10 },
};
// The exact answer gets all the points; anything else starts at YEAR_NEAR_POINTS and falls in a straight line with the
// distance, reaching 0 at YEAR_ZERO_SHARE of the line's length (on any timeline or bar), so being 5-10% off costs little.
export const YEAR_MAX_POINTS = 1000;
const YEAR_NEAR_POINTS = 900;
const YEAR_ZERO_SHARE = 0.6;

/** Points of a guess `diff` away (not exact) on a line `span` long: 900 down to 0, in a straight line. */
function nearPoints(diff, span) {
  return Math.max(0, Math.round(YEAR_NEAR_POINTS * (1 - diff / (span * YEAR_ZERO_SHARE))));
}

// The age of an event, by its year: "antigua", "media", "moderna" or "contemporanea". It is not a setting, only how
// long the event's timeline is (TIMELINES), which also sets how fast its points fall. The event that opens an age
// belongs to it (476, 1492, 1789).
export function eraOf(year) {
  if (year <= 476) return "antigua";
  if (year < 1492) return "media";
  if (year < 1789) return "moderna";
  return "contemporanea";
}

export function defaultHistoryConfig() {
  return { rounds: 5, roundMs: 10000, styles: [...HISTORY_STYLES], categories: [...TOPICS], difficulties: [...HISTORY_LEVELS] };
}

const clamp = (n, { min, max }, fallback) => Math.min(max, Math.max(min, Math.round(Number(n)) || fallback));

const pickList = (change, allowed, fallback) => (Array.isArray(change) ? allowed.filter((v) => change.includes(v)) : fallback);
// A single difficulty of an older client as the list of levels it means.
const levelsOf = (difficulty) => (difficulty === "mixta" ? [...HISTORY_LEVELS] : HISTORY_LEVELS.includes(difficulty) ? [difficulty] : null);

/**
 * Merges a settings change into the current Rango settings, keeping every value valid. Any list may be left empty
 * (the match then has no questions and can't start). The ages an older client may still send are ignored, and so
 * are the `styles`: Cifras is the only way to play.
 */
export function mergeHistoryConfig(current, change = {}) {
  const base = { ...defaultHistoryConfig(), ...current };
  const baseLevels = levelsOf(current?.difficulty) && !current?.difficulties ? levelsOf(current.difficulty) : base.difficulties;
  return {
    rounds: change.rounds != null ? clamp(change.rounds, HISTORY_LIMITS.rounds, base.rounds) : base.rounds,
    roundMs: change.roundMs != null ? clamp(change.roundMs, HISTORY_LIMITS.roundMs, base.roundMs) : base.roundMs,
    styles: [...HISTORY_STYLES],
    categories: pickList(change.categories, TOPICS, base.categories),
    difficulties: pickList(change.difficulties, HISTORY_LEVELS, levelsOf(change.difficulty) || baseLevels),
  };
}

/**
 * The Rango questions: the events of history/events.js and the figures of history/figures.js (the source of truth,
 * with their topics) plus any other row of mode "historia" in the loaded bank (questions/questionBank.js: Supabase...),
 * so an event added to the list is played before it is uploaded, and a row only in the database is still played.
 * Where both have the same id, the list wins.
 */
export function historyBank(questions = []) {
  const built = [...buildHistoryQuestions(), ...buildFigureQuestions()].map(toQuestion);
  const known = new Set(built.map((q) => q.id));
  const extra = questions.filter((q) => q.mode === HISTORY_MODE && (q.type === "year" || q.type === "number") && !known.has(q.id));
  return [...built, ...extra];
}

/** The questions that match the settings. `ignore` leaves one filter out (to count what each chip would add). */
function questionsFor(bank, config, ignore = null) {
  const { styles, categories, difficulties } = mergeHistoryConfig(config);
  return bank.filter(
    (q) =>
      (ignore === "styles" || styles.includes(styleOf(q))) &&
      (ignore === "categories" || categories.includes(q.category)) &&
      (ignore === "difficulties" || difficulties.includes(q.difficulty))
  );
}

/** How many events a match with these settings can draw from (it needs one per round). */
export function countHistoryQuestions(bank, config) {
  return questionsFor(bank, config).length;
}

/** For the settings' chips: how many questions each way of playing, topic and difficulty has with the other settings. */
export function historyCounts(bank, config) {
  const tally = (ignore, key) => {
    const out = {};
    for (const q of questionsFor(bank, config, ignore)) out[key(q)] = (out[key(q)] || 0) + 1;
    return out;
  };
  return {
    styles: tally("styles", styleOf),
    categories: tally("categories", (q) => q.category),
    difficulties: tally("difficulties", (q) => q.difficulty),
  };
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** How a year is written: 44 a. C. for the negative ones. */
export function yearLabel(year) {
  return year < 0 ? `${-year} a. C.` : String(year);
}

/** Years between two years, knowing there is no year 0 (from 1 a. C. to 1 d. C. is one year). */
export function yearsApart(a, b) {
  const gap = Math.abs(a - b);
  return a < 0 !== b < 0 ? gap - 1 : gap;
}

/**
 * The timeline of an event: its age's `span` of years between two round numbers, with the year inside and never at
 * either end, drawn at random so where the year sits says nothing. A recent event's timeline can reach the next round
 * year after today (2030); the years still to come show but can't be chosen (placeYear). Year 0 doesn't exist, so it
 * is never an end.
 */
export function yearRange(year, random = Math.random) {
  const { span, round: step } = TIMELINES[eraOf(year)];
  const limit = Math.ceil(currentYear() / step) * step;
  const options = [];
  for (let min = Math.floor((year - span) / step) * step + step; min < year; min += step) {
    const max = min + span;
    if (max <= limit && min !== 0 && max !== 0) options.push({ min, max });
  }
  const pick = options.length ? options[Math.floor(random() * options.length)] : { min: limit - span, max: limit };
  return { ...pick, span };
}

export function currentYear() {
  return new Date().getFullYear();
}

/** Points of a guess `diff` years away from an event of that age. */
export function yearPoints(diff, era) {
  if (diff === 0) return YEAR_MAX_POINTS;
  return nearPoints(diff, TIMELINES[era].span);
}

// ---- Cifras ----
// The bar of a figure is a round span (1, 2 or 5 followed by zeros, at least 10) between 1.25 and 6 times the answer,
// starting on one of its tenths, with the answer inside and never near either end. A guess moves in steps of a
// thousandth of the bar (`snap`, at least 1) and is exact within half a hundredth of it (on a bar of 10, only the
// number itself); past that the points fall like a year's (nearPoints), by the bar's length.
const NICE = [1, 2, 5, 10, 20, 50, 100];

export function figureRange(value, random = Math.random) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const span =
    NICE.map((k) => k * magnitude).find((s) => s >= 10 && s >= value * 1.25 && s <= Math.max(10, value * 6)) ||
    Math.max(10, 100 * magnitude);
  const tick = span / 10;
  const options = [];
  for (let min = 0; min < value - span * 0.05; min += tick) {
    if (min + span > value + span * 0.05) options.push(min);
  }
  const min = options.length ? options[Math.floor(random() * options.length)] : 0;
  return { min, max: min + span, span, snap: Math.max(1, Math.round(span / 1000)) };
}

/** How far a guess may be from a figure whose bar is `span` long and still be exact. */
export function figureTolerance(span) {
  return Math.floor(span / 200);
}

/** Points of a guess `diff` away from a figure whose bar is `span` long. */
export function figurePoints(diff, span) {
  if (diff <= figureTolerance(span)) return YEAR_MAX_POINTS;
  return nearPoints(diff, span);
}

/** How a figure reads: "8849 m", "42.195 m", "3.333.360 puntos" (like the frontend's figureLabel). */
export function figureLabel(value, unit = "") {
  const text = Number(value).toLocaleString("es-ES", { useGrouping: Math.abs(value) >= 10000 });
  return unit ? `${text} ${unit}` : text;
}

/** A question as a round of the room (these objects stay on the server; see RoomManager.publicState). */
export function toHistoryTrack(q) {
  if (q.type === "number") {
    const { value, unit = "" } = q.data;
    const { min, max, span, snap } = figureRange(value);
    return { id: q.id, kind: "cifras", prompt: q.prompt, value, unit, category: q.category, difficulty: q.difficulty, min, max, span, snap };
  }
  const year = q.data.year;
  const { min, max } = yearRange(year);
  return { id: q.id, kind: "linea", prompt: q.prompt, year, era: eraOf(year), category: q.category, difficulty: q.difficulty, min, max };
}

/**
 * The questions of one way of playing, at most `count`: the chosen categories share them as evenly as they can (10
 * rounds of four categories = 3 + 3 + 2 + 2; a category that runs out leaves its rounds to the others), never two
 * events of the same year nor two figures with the same answer.
 */
function pickStyle(bank, settings, style, count) {
  const pools = shuffle(settings.categories).map((topic) =>
    shuffle(questionsFor(bank, { ...settings, styles: [style], categories: [topic] }))
  );
  const seen = new Set();
  const picked = [];
  while (picked.length < count && pools.some((p) => p.length)) {
    for (const pool of pools) {
      if (picked.length >= count) break;
      while (pool.length) {
        const q = pool.pop();
        const key = q.type === "number" ? `n${q.data.value}` : `y${q.data.year}`;
        if (seen.has(key)) continue;
        seen.add(key);
        picked.push(q);
        break;
      }
    }
  }
  return picked;
}

/**
 * The questions of a match: the ticked ways of playing share the rounds evenly (one that runs out leaves its rounds to
 * the other), and inside each the categories share them (pickStyle). In random order.
 */
export function pickHistoryQuestions(bank, config) {
  const settings = mergeHistoryConfig(config);
  const styles = shuffle(settings.styles);
  const lists = styles.map((style) => pickStyle(bank, settings, style, settings.rounds));
  const share = (i) => Math.floor(settings.rounds / styles.length) + (i < settings.rounds % styles.length ? 1 : 0);
  const take = lists.map((list, i) => Math.min(list.length, share(i)));
  let missing = settings.rounds - take.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lists.length && missing > 0; i += 1) {
    const more = Math.min(missing, lists[i].length - take[i]);
    take[i] += more;
    missing -= more;
  }
  return shuffle(lists.flatMap((list, i) => list.slice(0, take[i]))).map(toHistoryTrack);
}

/**
 * The question of a tiebreak: one not asked in this match, of the ticked ways of playing and categories, of a middling
 * difficulty when the match had it, else of the one it had.
 */
export function pickHistoryTiebreak(bank, config, usedIds = []) {
  const settings = mergeHistoryConfig(config);
  const used = new Set(usedIds);
  const left = questionsFor(bank, { ...settings, difficulties: [...HISTORY_LEVELS] }).filter((q) => !used.has(q.id));
  const level = settings.difficulties.includes("media") ? "media" : settings.difficulties[0];
  const pool = left.filter((q) => q.difficulty === level);
  const from = pool.length ? pool : left;
  return from.length ? toHistoryTrack(from[Math.floor(Math.random() * from.length)]) : null;
}
